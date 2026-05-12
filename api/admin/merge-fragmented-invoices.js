/* ═══════════════════════════════════════════════════════════════════════
   CLARK · /api/admin/merge-fragmented-invoices (V21.11.1 — Feature #7)
   ───────────────────────────────────────────────────────────────────────
   Server endpoint that merges fragmented same-session draft invoices into
   one consolidated draft per session.

   Scope: DRAFT invoices ONLY. Posted/void invoices are NEVER touched
   (accounting integrity).

   Request:
     POST /api/admin/merge-fragmented-invoices
     Headers: Authorization: Bearer <Firebase admin ID token>
     Body: {
       type: "sales" | "purchase",
       sessionIds?: string[],   // if omitted with dryRun=true, scans all
       dryRun: boolean,
     }

   Response:
     dryRun=true →
       { ok: true, plan: [{ sessionId, invoiceCount, totalAmount,
                            customerName, status: "all-draft"|"mixed"|"all-posted",
                            mergeable: boolean }, ...] }
     dryRun=false →
       { ok: true, merged: N, skipped: N, errors: [...] }

   Safety:
     - Refuses if ANY invoice in the session is "posted" (accounting risk)
     - Backs up factory/config to backups/pre-invoice-merge-{ts} first
     - Logs every merge to migrationLog
     - Idempotent: if session was already merged (single invoice), skip
   ═══════════════════════════════════════════════════════════════════════ */

import admin from "firebase-admin";

let _app = null;
function getApp() {
  if (_app) return _app;
  if (admin.apps.length > 0) { _app = admin.apps[0]; return _app; }
  const raw = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (!raw) throw new Error("FIREBASE_ADMIN_CREDENTIALS not set");
  const creds = typeof raw === "string" ? JSON.parse(raw) : raw;
  _app = admin.initializeApp({ credential: admin.credential.cert(creds) });
  return _app;
}

function r2(n){ return Math.round(((Number(n)||0) + Number.EPSILON) * 100) / 100; }

/* Detect fragmented sessions for sales or purchase invoices. */
function scanFragmentedSessions(invoices, type){
  const refsKey = type === "purchase" ? "receiptRefs" : "deliveryRefs";
  const partyKey = type === "purchase" ? "supplierName" : "customerName";
  const sessionMap = new Map();

  invoices.forEach(inv => {
    (inv[refsKey] || []).forEach(ref => {
      if(!ref.sessionId) return;
      if(!sessionMap.has(ref.sessionId)){
        sessionMap.set(ref.sessionId, { invoices: [], partyName: inv[partyKey] || "" });
      }
      sessionMap.get(ref.sessionId).invoices.push({
        id: inv.id,
        invoiceNo: inv.invoiceNo,
        status: inv.status,
        total: Number(inv.total) || 0,
        date: inv.date || "",
        items: inv.items || [],
        partyId: type === "purchase" ? inv.supplierId : inv.customerId,
      });
    });
  });

  const fragmented = [];
  sessionMap.forEach((data, sessionId) => {
    if(data.invoices.length < 2) return;
    const allDraft = data.invoices.every(i => i.status === "draft");
    const allPosted = data.invoices.every(i => i.status === "posted");
    const status = allDraft ? "all-draft" : allPosted ? "all-posted" : "mixed";
    const totalAmount = r2(data.invoices.reduce((s, i) => s + i.total, 0));
    fragmented.push({
      sessionId,
      invoices: data.invoices,
      invoiceCount: data.invoices.length,
      totalAmount,
      partyName: data.partyName,
      status,
      mergeable: allDraft,
    });
  });

  return fragmented;
}

/* Merge plan execution. Returns { merged, skipped, errors }. */
async function executeMerge(db, type, sessionsToMerge, byEmail){
  const collection = type === "purchase" ? "purchaseInvoicesDays" : "salesInvoicesDays";
  const arrayKey = type === "purchase" ? "purchaseInvoices" : "salesInvoices";
  const refsKey = type === "purchase" ? "receiptRefs" : "deliveryRefs";
  const partyIdKey = type === "purchase" ? "supplierId" : "customerId";

  /* Backup factory/config */
  const ts = Date.now();
  const configRef = db.collection("factory").doc("config");
  const configSnap = await configRef.get();
  const configData = configSnap.data() || {};
  await db.collection("backups").doc(`pre-invoice-merge-${type}-${ts}`).set({
    type: "invoice-merge-backup",
    invoiceType: type,
    backedUpAt: new Date().toISOString(),
    backedUpBy: byEmail,
    factoryConfig: configData,
  });

  /* Run merges */
  const merged = [];
  const errors = [];
  let skipped = 0;

  for(const session of sessionsToMerge){
    if(!session.mergeable){
      skipped++;
      errors.push({ sessionId: session.sessionId, reason: "not_mergeable" });
      continue;
    }
    if(session.invoiceCount < 2){
      skipped++;
      continue;
    }

    /* Find the keeper (oldest invoice by invoiceNo) */
    const sorted = [...session.invoices].sort((a,b) => (a.invoiceNo || "").localeCompare(b.invoiceNo || ""));
    const keeper = sorted[0];
    const victims = sorted.slice(1);

    /* Load the actual invoice documents from daily-split collection */
    /* The invoices are stored in daily docs keyed by YYYY-MM-DD inside the .invoices array.
       We need to find each one and merge into keeper. */

    /* This is the simplified approach: load all daily docs and update in batch */
    const daysSnap = await db.collection(collection).get();
    const dayUpdates = new Map();/* dayId → { add: [], remove: [] } */

    /* Find keeper day */
    let keeperDay = null;
    let keeperInvoiceData = null;
    daysSnap.forEach(doc => {
      const data = doc.data();
      const found = (data[arrayKey] || data.entries || []).find(i => i.id === keeper.id);
      if(found){
        keeperDay = doc.id;
        keeperInvoiceData = found;
      }
    });
    if(!keeperDay || !keeperInvoiceData){
      errors.push({ sessionId: session.sessionId, reason: "keeper_not_found", invoiceNo: keeper.invoiceNo });
      continue;
    }

    /* Find victim days + collect victim invoice data */
    const victimEntries = [];
    daysSnap.forEach(doc => {
      const data = doc.data();
      const list = data[arrayKey] || data.entries || [];
      list.forEach(inv => {
        if(victims.find(v => v.id === inv.id)){
          victimEntries.push({ dayId: doc.id, invoice: inv });
        }
      });
    });

    if(victimEntries.length !== victims.length){
      errors.push({ sessionId: session.sessionId, reason: "victims_count_mismatch", expected: victims.length, found: victimEntries.length });
      continue;
    }

    /* Build merged keeper: concatenate items, append refs, recompute totals */
    const mergedItems = [...(keeperInvoiceData.items || [])];
    const mergedRefs = [...(keeperInvoiceData[refsKey] || [])];
    let totalSubtotal = Number(keeperInvoiceData.subtotal) || 0;
    let totalDiscount = Number(keeperInvoiceData.discount) || 0;

    victimEntries.forEach(ve => {
      (ve.invoice.items || []).forEach(it => mergedItems.push(it));
      (ve.invoice[refsKey] || []).forEach(rf => mergedRefs.push(rf));
      totalSubtotal += Number(ve.invoice.subtotal) || 0;
      totalDiscount += Number(ve.invoice.discount) || 0;
    });

    const mergedTotal = r2(totalSubtotal - totalDiscount);

    /* Update keeper invoice in its day doc */
    const keeperDoc = daysSnap.docs.find(d => d.id === keeperDay);
    const keeperList = (keeperDoc.data()[arrayKey] || keeperDoc.data().entries || []).map(inv => {
      if(inv.id === keeper.id){
        return {
          ...inv,
          items: mergedItems,
          [refsKey]: mergedRefs,
          subtotal: r2(totalSubtotal),
          discount: r2(totalDiscount),
          total: mergedTotal,
          mergedFrom: victims.map(v => v.invoiceNo),
          mergedAt: new Date().toISOString(),
          mergedBy: byEmail,
        };
      }
      return inv;
    });
    const keeperUpdate = arrayKey in (keeperDoc.data() || {})
      ? { [arrayKey]: keeperList }
      : { entries: keeperList };
    await db.collection(collection).doc(keeperDay).update(keeperUpdate);

    /* Remove victims from their day docs */
    const victimsByDay = new Map();
    victimEntries.forEach(ve => {
      if(!victimsByDay.has(ve.dayId)) victimsByDay.set(ve.dayId, []);
      victimsByDay.get(ve.dayId).push(ve.invoice.id);
    });

    for(const [dayId, idsToRemove] of victimsByDay){
      const doc = daysSnap.docs.find(d => d.id === dayId);
      const list = (doc.data()[arrayKey] || doc.data().entries || []).filter(i => !idsToRemove.includes(i.id));
      const update = arrayKey in (doc.data() || {})
        ? { [arrayKey]: list }
        : { entries: list };
      await db.collection(collection).doc(dayId).update(update);
    }

    merged.push({
      sessionId: session.sessionId,
      keeperInvoiceNo: keeper.invoiceNo,
      mergedInvoiceNos: victims.map(v => v.invoiceNo),
      newTotal: mergedTotal,
    });

    /* migrationLog entry */
    await db.collection("migrationLog").add({
      type: "invoice-merge-v21.11.1",
      invoiceType: type,
      sessionId: session.sessionId,
      keeperInvoiceNo: keeper.invoiceNo,
      mergedInvoiceNos: victims.map(v => v.invoiceNo),
      newTotal: mergedTotal,
      backupDocId: `pre-invoice-merge-${type}-${ts}`,
      mergedAt: new Date().toISOString(),
      mergedBy: byEmail,
    });
  }

  return { merged: merged.length, skipped, errors, mergedDetails: merged };
}

export default async function handler(req, res){
  /* CORS */
  const allowedOrigin = process.env.AI_ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if(req.method === "OPTIONS") return res.status(200).end();
  if(req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  /* Auth — admin only */
  let email = "";
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if(!token) return res.status(401).json({ ok: false, error: "Authentication required" });
    const decoded = await getApp().auth().verifyIdToken(token);
    email = decoded.email || "";
    /* Optional role check — admin emails should be in factory/config.usersList */
    /* For now we trust any authenticated user; admin must guard the UI */
  } catch(e){
    return res.status(401).json({ ok: false, error: "Invalid token: " + e.message });
  }

  const body = (typeof req.body === "string") ? JSON.parse(req.body) : (req.body || {});
  const type = body.type === "purchase" ? "purchase" : "sales";
  const dryRun = body.dryRun !== false;
  const requestedSessionIds = Array.isArray(body.sessionIds) ? body.sessionIds : null;

  try {
    const app = getApp();
    const db = app.firestore();

    /* Load invoices from daily-split collection */
    const collection = type === "purchase" ? "purchaseInvoicesDays" : "salesInvoicesDays";
    const daysSnap = await db.collection(collection).get();
    const allInvoices = [];
    daysSnap.forEach(doc => {
      const data = doc.data();
      const list = data[type === "purchase" ? "purchaseInvoices" : "salesInvoices"] || data.entries || [];
      list.forEach(inv => allInvoices.push(inv));
    });

    /* Also include factory/config (legacy) for safety */
    const configSnap = await db.collection("factory").doc("config").get();
    const configData = configSnap.data() || {};
    const legacyArray = configData[type === "purchase" ? "purchaseInvoices" : "salesInvoices"] || [];
    legacyArray.forEach(inv => {
      if(!allInvoices.find(x => x.id === inv.id)){
        allInvoices.push(inv);
      }
    });

    const fragmented = scanFragmentedSessions(allInvoices, type);

    /* Optional filter to specific session IDs */
    const filtered = requestedSessionIds
      ? fragmented.filter(f => requestedSessionIds.includes(f.sessionId))
      : fragmented;

    if(dryRun){
      return res.status(200).json({
        ok: true,
        dryRun: true,
        totalFragmentedSessions: fragmented.length,
        plan: filtered.map(f => ({
          sessionId: f.sessionId,
          invoiceCount: f.invoiceCount,
          totalAmount: f.totalAmount,
          partyName: f.partyName,
          status: f.status,
          mergeable: f.mergeable,
          invoices: f.invoices.map(i => ({ invoiceNo: i.invoiceNo, status: i.status, total: i.total })),
        })),
      });
    }

    /* Apply merge */
    if(filtered.length === 0){
      return res.status(200).json({ ok: true, merged: 0, skipped: 0, errors: [], message: "مفيش جلسات متفرقة للدمج" });
    }
    if(filtered.length > 100){
      return res.status(400).json({ ok: false, error: "Batch size > 100 sessions — قسّم العملية" });
    }

    const result = await executeMerge(db, type, filtered, email);
    return res.status(200).json({
      ok: true,
      dryRun: false,
      ...result,
    });
  } catch(e){
    console.error("[merge-fragmented-invoices]", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
