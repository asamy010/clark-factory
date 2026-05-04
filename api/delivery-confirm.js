/* ═══════════════════════════════════════════════════════════════
   GET  /api/delivery-confirm?s=<sessionId>&c=<custId>&sig=<hmac>
        → returns delivery details (models, qtys, prices, customer name)
   POST /api/delivery-confirm
        Body: { s, c, sig, action: "confirm"|"issue", note?: string }
        → writes confirmation to session + creates notification
   
   Public endpoint. Authentication is via HMAC signature in the URL.
   No login required — designed to be opened by customer via QR scan.
   ═══════════════════════════════════════════════════════════════ */

import { setCors, verifySignature, getDb, appendToSplitDay, readPartitionedCollection } from "./_firebase.js";

/* Helpers for reading order data — orders use Firestore auto-generated docIds,
   NOT the internal `id` field. Must query by field, not fetch by docId. */
async function loadOrdersByIds(db, ids, season) {
  if (!season || ids.length === 0) return {};
  const out = {};
  /* Firestore `in` operator supports up to 30 values per query */
  const chunks = [];
  for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
  const col = db.collection("seasons").doc(season).collection("orders");
  for (const chunk of chunks) {
    const snap = await col.where("id", "in", chunk).get();
    snap.forEach((d) => {
      const o = d.data();
      if (o && o.id) out[o.id] = o;
    });
  }
  return out;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    /* ─── Extract + validate signature ─── */
    let sessionId, custId, sig, action, note;
    if (req.method === "GET") {
      sessionId = req.query.s;
      custId = req.query.c;
      sig = req.query.sig;
    } else if (req.method === "POST") {
      const b = req.body || {};
      sessionId = b.s;
      custId = b.c;
      sig = b.sig;
      action = b.action;
      note = (b.note || "").slice(0, 500);
    } else {
      return res.status(405).json({ error: "method not allowed" });
    }

    if (!verifySignature(sessionId, custId, sig)) {
      return res.status(403).json({ error: "رابط غير صالح أو تم العبث به" });
    }

    const db = getDb();

    /* ─── Load sales doc (has custDeliverySessions + customers may be in config) ─── */
    const salesDoc = await db.collection("factory").doc("sales").get();
    const configDoc = await db.collection("factory").doc("config").get();
    if (!salesDoc.exists) return res.status(404).json({ error: "بيانات التوزيع غير موجودة" });

    const sales = salesDoc.data();
    const config = configDoc.exists ? configDoc.data() : {};
    const sessions = sales.custDeliverySessions || [];
    /* V16.12: Defensive String() compares — IDs from URL are always strings,
       but legacy data may store them as numbers. Strict === would silently
       fail to find the session/customer/membership. */
    const session = sessions.find((s) => String(s.id) === String(sessionId));
    if (!session) return res.status(404).json({ error: "جلسة التسليم غير موجودة" });

    /* V19.57 HOTFIX: customers moved out of factory/config to customersDocs/*. */
    const customers = config._partitionedV1957Done
      ? await readPartitionedCollection("customersDocs")
      : (config.customers || []);
    const customer = customers.find((c) => String(c.id) === String(custId));
    if (!customer) return res.status(404).json({ error: "العميل غير موجود" });

    /* ─── Check customer is part of this session ─── */
    const custIds = (session.custIds || []).map(String);
    if (!custIds.includes(String(custId))) {
      return res.status(403).json({ error: "العميل ليس ضمن هذه الجلسة" });
    }

    /* ─── Load order/model data from seasons/<season>/orders ─── */
    const season = sales.activeSeason || config.activeSeason || "WS26";
    const modelIds = session.modelIds || [];
    const orders = await loadOrdersByIds(db, modelIds, season);

    /* ─── Build row details for this customer ─── */
    const grid = session.grid || {};
    const rows = modelIds
      .map((oid) => {
        const o = orders[oid];
        if (!o) return null;
        const plannedQty = Number(grid[oid + "_" + custId]) || 0;
        /* Actual delivery for this customer in this session (may differ if actualSales set or from deliveries array) */
        const custDels = (o.customerDeliveries || []).filter(
          (d) => d.custId === custId && d.sessionId === sessionId
        );
        const delQty = custDels.reduce((s, d) => s + (Number(d.qty) || 0), 0);
        /* Price: per-delivery price takes precedence (discounted sales), fallback to order sellPrice */
        const firstPrice = custDels.find((d) => Number(d.price) > 0);
        const price = firstPrice ? Number(firstPrice.price) : Number(o.sellPrice) || 0;
        const qty = delQty > 0 ? delQty : plannedQty;
        if (qty <= 0) return null;
        return {
          modelNo: o.modelNo || "",
          modelDesc: o.modelDesc || "",
          qty,
          price,
          total: qty * price,
          isDiscounted: !!(firstPrice && firstPrice.price !== Number(o.sellPrice)),
        };
      })
      .filter(Boolean);

    const grandTotalQty = rows.reduce((s, r) => s + r.qty, 0);
    const grandTotalMoney = rows.reduce((s, r) => s + r.total, 0);

    /* ─── Current confirmation state ─── */
    const currentConfirm =
      (session.confirmations && session.confirmations[custId]) || null;

    /* ─── Branding ─── */
    const brand = {
      factoryName: config.factoryName || "CLARK Factory",
      logo: config.logo || "",
    };

    /* ─── GET: return details ─── */
    if (req.method === "GET") {
      return res.status(200).json({
        ok: true,
        session: {
          id: session.id,
          date: session.date || "",
        },
        customer: {
          id: customer.id,
          name: customer.name || "",
          type: customer.type || "",
        },
        rows,
        grandTotalQty,
        grandTotalMoney,
        currentConfirm,
        brand,
        /* V15.54: Diagnostic info — helps troubleshoot empty tables.
           These fields show what was loaded vs what's expected. */
        _debug: {
          season,
          modelIdsInSession: modelIds.length,
          ordersFound: Object.keys(orders).length,
          gridKeysForCustomer: Object.keys(grid).filter((k) => k.endsWith("_" + custId)).length,
          rowsBuilt: rows.length,
        },
      });
    }

    /* ─── POST: record confirmation ─── */
    if (!["confirm", "issue"].includes(action)) {
      return res.status(400).json({ error: "action must be 'confirm' or 'issue'" });
    }

    /* ─── Check 24-hour lock ─── */
    if (currentConfirm && currentConfirm.at) {
      const ageMs = Date.now() - new Date(currentConfirm.at).getTime();
      if (ageMs < 24 * 60 * 60 * 1000 && currentConfirm.status === action) {
        /* Same action within 24h — idempotent, return success without writing */
        return res.status(200).json({ ok: true, alreadyConfirmed: true, status: currentConfirm.status });
      }
      if (ageMs >= 24 * 60 * 60 * 1000) {
        return res.status(403).json({ error: "انتهت صلاحية التأكيد — يرجى التواصل مع المصنع" });
      }
    }

    /* Capture IP (first X-Forwarded-For or remote) */
    const ip =
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.socket?.remoteAddress ||
      "";

    const confirmEntry = {
      status: action,
      at: new Date().toISOString(),
      note: action === "issue" ? note || "" : "",
      ip: ip || "",
      grandTotalQty,
      grandTotalMoney,
    };

    /* ─── Update session in factory/sales (transactional) ─── */
    const salesRef = db.collection("factory").doc("sales");
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(salesRef);
      if (!snap.exists) throw new Error("sales doc missing");
      const data = snap.data();
      const list = data.custDeliverySessions || [];
      const idx = list.findIndex((s) => s.id === sessionId);
      if (idx < 0) throw new Error("session not found");
      if (!list[idx].confirmations) list[idx].confirmations = {};
      list[idx].confirmations[custId] = confirmEntry;
      tx.update(salesRef, { custDeliverySessions: list });
    });

    /* ─── Create notification for accountant(s) ─── */
    /* V19.53: notifications moved to notificationsDays/* (daily-split). Use the
       appendToSplitDay helper which handles the right day-doc transaction.
       Per-user reads/dismisses now live in userNotifStates/{email} (not on
       the notification entry itself), so the entry is immutable post-create. */
    const msgPrefix = action === "confirm" ? "✅" : "⚠️";
    const msgBody =
      action === "confirm"
        ? customer.name + " أكد استلام التوزيعة (" + grandTotalQty + " قطعة)"
        : customer.name + " أبلغ عن مشكلة في التوزيعة" + (note ? ": " + note.slice(0, 80) : "");
    const notifEntry = {
      id: "dc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7),
      type: action === "confirm" ? "delivery_confirmed" : "delivery_issue",
      msg: msgPrefix + " " + msgBody,
      toEmail: "all", /* Broadcast to all users — any accountant/owner can see it */
      link: "custDelivery",
      sessionId: sessionId,
      custId: custId,
      createdAt: new Date().toISOString(),
      severity: action === "confirm" ? "info" : "warning",
    };
    /* V19.53: write directly to notificationsDays/{today}. Falls back to
       config.notifications array push if the V19.53 migration hasn't run yet
       (backward compat for deployments still on V19.52 schema). */
    try {
      const configSnap = await db.collection("factory").doc("config").get();
      const cfg = configSnap.exists ? configSnap.data() : {};
      if (cfg._splitDaysV1953Done) {
        await appendToSplitDay("notificationsDays", notifEntry);
      } else {
        /* Pre-V19.53 path */
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
      /* Non-fatal — the main confirm succeeded; just log */
      console.warn("[delivery-confirm] notification write failed (non-fatal):", notifErr);
    }

    res.status(200).json({ ok: true, status: action, at: confirmEntry.at });
  } catch (e) {
    console.error("delivery-confirm error:", e);
    res.status(500).json({ error: e.message || "internal error" });
  }
}
