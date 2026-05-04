/* ═══════════════════════════════════════════════════════════════
   GET  /api/workshop-delivery-confirm?ord=<orderId>&ws=<wsId>&idx=<deliveryIdx>&sig=<hmac>
        → returns workshop + delivery details + current confirmation state
   POST /api/workshop-delivery-confirm
        Body: { ord, ws, idx, sig, action: "confirm"|"issue", note?: string }
        → writes confirmation to workshopDeliveries[idx] + creates a notification

   Public endpoint. Authentication is via HMAC signature in the URL.
   No login required — designed to be opened by the workshop after scanning the
   QR printed on a delivery label. Mirrors /api/delivery-confirm (the customer
   equivalent) so the two flows stay in step.

   V16.73: introduced. Backwards compatible with the existing in-app
   `?act=wsdel&...` path which is still handled by App.jsx for old labels
   printed before V16.73 (those have no signature and require login).
   ═══════════════════════════════════════════════════════════════ */

import { setCors, verifyWorkshopSignature, getDb, appendToSplitDay, readPartitionedCollection } from "./_firebase.js";

/* Orders use Firestore auto-generated docIds, NOT the internal `id` field —
   query by field. Returns the {docRef, doc} so we can update in place. */
async function findOrderRefById(db, orderId, season) {
  if (!orderId || !season) return null;
  const col = db.collection("seasons").doc(season).collection("orders");
  const snap = await col.where("id", "==", orderId).limit(1).get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { ref: d.ref, data: d.data() };
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    /* ─── Extract + validate signature ─── */
    let orderId, wsId, idx, sig, action, note;
    if (req.method === "GET") {
      orderId = req.query.ord;
      wsId = req.query.ws;
      idx = req.query.idx;
      sig = req.query.sig;
    } else if (req.method === "POST") {
      const b = req.body || {};
      orderId = b.ord;
      wsId = b.ws;
      idx = b.idx;
      sig = b.sig;
      action = b.action;
      note = (b.note || "").slice(0, 500);
    } else {
      return res.status(405).json({ error: "method not allowed" });
    }

    /* idx is a numeric position in workshopDeliveries[] — coerce safely.
       0 is a legitimate value (first delivery), so check for null/undefined/empty
       rather than truthiness. */
    if (idx === undefined || idx === null || idx === "") {
      return res.status(400).json({ error: "idx مفقود" });
    }
    const idxNum = Number(idx);
    if (!Number.isInteger(idxNum) || idxNum < 0) {
      return res.status(400).json({ error: "idx غير صالح" });
    }

    if (!verifyWorkshopSignature(orderId, wsId, idx, sig)) {
      return res.status(403).json({ error: "رابط غير صالح أو تم العبث به" });
    }

    const db = getDb();

    /* ─── Resolve active season (same source the customer flow uses) ─── */
    const configDoc = await db.collection("factory").doc("config").get();
    const salesDoc = await db.collection("factory").doc("sales").get();
    const config = configDoc.exists ? configDoc.data() : {};
    const sales = salesDoc.exists ? salesDoc.data() : {};
    const season = sales.activeSeason || config.activeSeason || "WS26";

    /* ─── Load the order ─── */
    const found = await findOrderRefById(db, orderId, season);
    if (!found) return res.status(404).json({ error: "الأوردر غير موجود" });
    const order = found.data;

    const wds = Array.isArray(order.workshopDeliveries) ? order.workshopDeliveries : [];
    if (idxNum >= wds.length) {
      return res.status(404).json({ error: "التسليم غير موجود في هذا الأوردر" });
    }
    const wd = wds[idxNum];

    /* ─── Match the wsId in the delivery (defends against label/data drift) ─── */
    if (wd.wsId && String(wd.wsId) !== String(wsId)) {
      return res.status(403).json({ error: "بيانات التسليم لا تطابق الورشة" });
    }

    /* ─── Resolve workshop name (legacy data may store wsName only) ─── */
    /* V19.57 HOTFIX: workshops moved out of factory/config to workshopsDocs/*. */
    const workshops = config._partitionedV1957Done
      ? await readPartitionedCollection("workshopsDocs")
      : (Array.isArray(config.workshops) ? config.workshops : []);
    const wsObj = workshops.find((w) => String(w.id) === String(wsId)) ||
                  workshops.find((w) => w.name === wd.wsName) ||
                  null;
    const wsName = (wsObj && wsObj.name) || wd.wsName || "";

    /* ─── Compute receive summary ─── */
    const delQty = Number(wd.qty) || 0;
    const receives = Array.isArray(wd.receives) ? wd.receives : [];
    const totalRcv = receives.reduce((s, r) => s + (Number(r.qty) || 0), 0);
    const remaining = Math.max(0, delQty - totalRcv);

    /* ─── Branding ─── */
    const brand = {
      factoryName: config.factoryName || "CLARK Factory",
      logo: config.logo || "",
    };

    /* ─── GET: return details ─── */
    if (req.method === "GET") {
      return res.status(200).json({
        ok: true,
        order: {
          id: order.id,
          modelNo: order.modelNo || "",
          modelDesc: order.modelDesc || "",
          sizeLabel: order.sizeLabel || "",
        },
        workshop: {
          id: wsId,
          name: wsName,
        },
        delivery: {
          idx: idxNum,
          date: wd.date || "",
          qty: delQty,
          garmentType: wd.garmentType || "",
          receives: receives.map((r) => ({
            date: r.date || "",
            qty: Number(r.qty) || 0,
          })),
          totalRcv,
          remaining,
        },
        currentConfirm: wd.confirmation || null,
        brand,
      });
    }

    /* ─── POST: record confirmation ─── */
    if (!["confirm", "issue"].includes(action)) {
      return res.status(400).json({ error: "action must be 'confirm' or 'issue'" });
    }

    /* 24-hour idempotency lock — same rule the customer flow uses */
    const currentConfirm = wd.confirmation || null;
    if (currentConfirm && currentConfirm.at) {
      const ageMs = Date.now() - new Date(currentConfirm.at).getTime();
      if (ageMs < 24 * 60 * 60 * 1000 && currentConfirm.status === action) {
        return res.status(200).json({ ok: true, alreadyConfirmed: true, status: currentConfirm.status });
      }
      if (ageMs >= 24 * 60 * 60 * 1000) {
        return res.status(403).json({ error: "انتهت صلاحية التأكيد — يرجى التواصل مع المصنع" });
      }
    }

    const ip =
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.socket?.remoteAddress ||
      "";

    const confirmEntry = {
      status: action,
      at: new Date().toISOString(),
      note: action === "issue" ? note || "" : "",
      ip: ip || "",
      delQty,
    };

    /* ─── Update the order's workshopDeliveries[idx].confirmation ─── */
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(found.ref);
      if (!snap.exists) throw new Error("order doc missing");
      const data = snap.data();
      const list = Array.isArray(data.workshopDeliveries) ? data.workshopDeliveries.slice() : [];
      if (idxNum >= list.length) throw new Error("delivery index out of bounds (data drift)");
      list[idxNum] = { ...list[idxNum], confirmation: confirmEntry };
      tx.update(found.ref, { workshopDeliveries: list });
    });

    /* ─── Notification for factory staff ─── */
    /* V19.53: notifications split into notificationsDays/* — see delivery-confirm.js
       for the same pattern + reasoning. */
    const msgPrefix = action === "confirm" ? "✅" : "⚠️";
    const msgBody =
      action === "confirm"
        ? "ورشة " + (wsName || "") + " أكدت استلام " + delQty + " قطعة من موديل " + (order.modelNo || "")
        : "ورشة " + (wsName || "") + " أبلغت عن مشكلة في تسليم موديل " + (order.modelNo || "") +
          (note ? ": " + note.slice(0, 80) : "");
    const notifEntry = {
      id: "wd_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7),
      type: action === "confirm" ? "ws_delivery_confirmed" : "ws_delivery_issue",
      msg: msgPrefix + " " + msgBody,
      toEmail: "all",
      link: "external",
      orderId: orderId,
      wsId: wsId,
      deliveryIdx: idxNum,
      createdAt: new Date().toISOString(),
      severity: action === "confirm" ? "info" : "warning",
    };
    try {
      const configSnap = await db.collection("factory").doc("config").get();
      const cfg = configSnap.exists ? configSnap.data() : {};
      if (cfg._splitDaysV1953Done) {
        await appendToSplitDay("notificationsDays", notifEntry);
      } else {
        const configRef = db.collection("factory").doc("config");
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(configRef);
          const data = snap.exists ? snap.data() : {};
          const list = Array.isArray(data.notifications) ? data.notifications : [];
          list.unshift(notifEntry);
          const trimmed = list.slice(0, 500);
          tx.set(configRef, { notifications: trimmed }, { merge: true });
        });
      }
    } catch (notifErr) {
      console.warn("[workshop-delivery-confirm] notification write failed (non-fatal):", notifErr);
    }

    res.status(200).json({ ok: true, status: action, at: confirmEntry.at });
  } catch (e) {
    console.error("workshop-delivery-confirm error:", e);
    res.status(500).json({ error: e.message || "internal error" });
  }
}
