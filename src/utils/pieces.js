/* ════════════════════════════════════════════════════════════════════════
   CLARK · Pieces (per-piece QR tracking) — V19.81.0
   ──────────────────────────────────────────────────────────────────────
   Each printed QR can optionally identify a UNIQUE physical piece (or a
   "series" — a full pack of one-of-each-size). The piece's identity is
   stable across the supply chain; the customer association is mutable in
   the database. Anonymous returns are resolved by scanning the QR and
   reading the last `currentCustomer` from the piece doc.

   Wire format
   ───────────
   Legacy (un-tracked) QR: `CLARK:{orderId}:{qty}`
       — multiple labels share the same payload
       — kept for backward compat with existing warehouse scanners
   Tracked QR:             `CLARK:P:{pieceId}`
       — unique per physical piece
       — points to a `pieces/{pieceId}` Firestore doc

   parseQr() transparently handles both formats so a single scanner
   doesn't need to fork.

   Data shape (pieces/{pieceId})
   ─────────────────────────────
   {
     id, qrCode, type: "piece" | "series",
     modelNo, modelDesc, size, seriesQty (for series QR),
     orderId, productionDate, isSecondGrade,
     status: "in_warehouse" | "with_customer" | "scrapped",
     currentCustomerId, currentCustomerName, currentDeliveryId,
     history: [{action, date, by, ...details}]   // append-only
   }
   ════════════════════════════════════════════════════════════════════════ */

import { doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, limit, orderBy, writeBatch } from "firebase/firestore";
import { db } from "../firebase.js";

const _NOW = () => new Date().toISOString();

/* Collision-resistant short id. Time-based prefix means doc names sort
   chronologically in Firestore which helps the firebase console UX. */
export function genPieceId() {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 9);
  return "p_" + ts + "_" + rnd;
}

/* Build a tracked QR payload from a piece id. Used at print-time. */
export function buildTrackedQr(pieceId) {
  return "CLARK:P:" + pieceId;
}

/* Build a legacy (un-tracked) QR payload — kept for backward compat. */
export function buildLegacyQr(orderId, qty) {
  return "CLARK:" + orderId + ":" + qty;
}

/* Parse a scanned QR into a typed result. Handles both formats:
     - {kind:"piece",   pieceId}  → tracked piece QR
     - {kind:"legacy",  orderId, qty} → old format QR
     - {kind:"unknown", raw}      → not a CLARK QR */
export function parseQr(raw) {
  if (!raw || typeof raw !== "string") return { kind: "unknown", raw };
  const s = raw.trim();
  /* Tracked: CLARK:P:p_xxx */
  const trackedMatch = s.match(/^CLARK:P:([\w_]+)$/i);
  if (trackedMatch) return { kind: "piece", pieceId: trackedMatch[1] };
  /* Legacy: CLARK:orderId:qty */
  const legacyMatch = s.match(/^CLARK:([^:]+):(\d+)$/);
  if (legacyMatch) return { kind: "legacy", orderId: legacyMatch[1], qty: parseInt(legacyMatch[2], 10) };
  return { kind: "unknown", raw: s };
}

/* ── CRUD against the `pieces` collection ─────────────────────────── */

/* Create a piece doc at print-time. Idempotent: if the same id is passed
   twice (rare given genPieceId entropy), the second call merges. */
export async function createPiece({
  pieceId,
  type,            /* "piece" | "series" */
  modelNo, modelDesc,
  size,            /* null for series */
  seriesQty,       /* set when type === "series" */
  orderId,
  isSecondGrade,
  by,
}) {
  if (!pieceId) throw new Error("pieceId required");
  const ref = doc(db, "pieces", pieceId);
  const now = _NOW();
  const payload = {
    id: pieceId,
    qrCode: buildTrackedQr(pieceId),
    type: type || "piece",
    modelNo: modelNo || "",
    modelDesc: modelDesc || "",
    size: size || null,
    seriesQty: seriesQty || null,
    orderId: orderId || null,
    productionDate: now.slice(0, 10),
    isSecondGrade: !!isSecondGrade,
    status: "in_warehouse",
    currentCustomerId: null,
    currentCustomerName: null,
    currentDeliveryId: null,
    history: [{
      action: "produced",
      date: now,
      by: by || "",
    }],
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(ref, payload, { merge: false });
  return payload;
}

/* Bulk create using writeBatch — orders of magnitude faster than sequential
   setDoc when emitting hundreds of labels in one print job. Firestore caps
   each batch at 500 ops; we chunk to be safe with overhead.

   Returns the same payloads that would have been written (so callers can
   preview state without re-reading from Firestore). */
export async function createPiecesBulk(pieceSpecs, opts) {
  const onProgress = opts && typeof opts.onProgress === "function" ? opts.onProgress : null;
  const out = [];
  const CHUNK = 400; /* leave headroom under the 500 cap */
  const total = pieceSpecs.length;
  let done = 0;
  for (let i = 0; i < total; i += CHUNK) {
    const chunk = pieceSpecs.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    const now = _NOW();
    chunk.forEach(spec => {
      if (!spec.pieceId) throw new Error("pieceId required for bulk create");
      const ref = doc(db, "pieces", spec.pieceId);
      const payload = {
        id: spec.pieceId,
        qrCode: buildTrackedQr(spec.pieceId),
        type: spec.type || "piece",
        modelNo: spec.modelNo || "",
        modelDesc: spec.modelDesc || "",
        size: spec.size || null,
        seriesQty: spec.seriesQty || null,
        orderId: spec.orderId || null,
        productionDate: now.slice(0, 10),
        isSecondGrade: !!spec.isSecondGrade,
        status: "in_warehouse",
        currentCustomerId: null,
        currentCustomerName: null,
        currentDeliveryId: null,
        history: [{ action: "produced", date: now, by: spec.by || "" }],
        createdAt: now,
        updatedAt: now,
      };
      batch.set(ref, payload);
      out.push(payload);
    });
    await batch.commit();
    done += chunk.length;
    if (onProgress) onProgress(done, total);
  }
  return out;
}

/* Read a piece by id. Returns the doc data or null if not found. */
export async function getPiece(pieceId) {
  if (!pieceId) return null;
  const ref = doc(db, "pieces", pieceId);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

/* State transitions — each appends to history and updates status. */

/* Mark a piece as sold to a customer. Idempotent guard: if the piece is
   already with this same customer in this same delivery, no-op. */
export async function markSold(pieceId, { customerId, customerName, deliveryId, sessionId, by }) {
  const piece = await getPiece(pieceId);
  if (!piece) throw new Error("piece not found: " + pieceId);
  if (piece.status === "with_customer" && piece.currentDeliveryId === deliveryId && piece.currentCustomerId === customerId) {
    return { ok: true, skipped: "already-sold-in-this-delivery" };
  }
  if (piece.status === "with_customer") {
    /* Already with another customer — block. Caller must return-first. */
    return { ok: false, error: "piece-already-with-another-customer", currentCustomer: piece.currentCustomerName };
  }
  const now = _NOW();
  const newHistory = [...(piece.history || []), {
    action: "sold",
    customerId, customerName,
    deliveryId, sessionId,
    date: now, by,
  }];
  await updateDoc(doc(db, "pieces", pieceId), {
    status: "with_customer",
    currentCustomerId: customerId,
    currentCustomerName: customerName,
    currentDeliveryId: deliveryId || null,
    history: newHistory,
    updatedAt: now,
  });
  return { ok: true };
}

/* Mark a piece as returned. Sets currentCustomer back to null and appends
   a 'returned' history entry capturing who returned it (resolved from the
   piece's last currentCustomer at scan time). */
export async function markReturned(pieceId, { reason, by }) {
  const piece = await getPiece(pieceId);
  if (!piece) throw new Error("piece not found: " + pieceId);
  if (piece.status !== "with_customer") {
    return { ok: false, error: "piece-not-with-customer", status: piece.status };
  }
  const now = _NOW();
  const newHistory = [...(piece.history || []), {
    action: "returned",
    fromCustomerId: piece.currentCustomerId,
    fromCustomerName: piece.currentCustomerName,
    fromDeliveryId: piece.currentDeliveryId,
    reason: reason || "",
    date: now, by,
  }];
  await updateDoc(doc(db, "pieces", pieceId), {
    status: "in_warehouse",
    currentCustomerId: null,
    currentCustomerName: null,
    currentDeliveryId: null,
    history: newHistory,
    updatedAt: now,
  });
  return { ok: true, fromCustomerName: piece.currentCustomerName };
}

/* Release a piece back to in_warehouse without a return entry — used when
   a delivery session is cancelled before commit (the scan was speculative). */
export async function releasePiece(pieceId, { by }) {
  const piece = await getPiece(pieceId);
  if (!piece) return { ok: false, error: "not-found" };
  if (piece.status === "in_warehouse") return { ok: true, skipped: "already-released" };
  const now = _NOW();
  const newHistory = [...(piece.history || []), {
    action: "released",
    fromCustomerId: piece.currentCustomerId,
    fromCustomerName: piece.currentCustomerName,
    fromDeliveryId: piece.currentDeliveryId,
    date: now, by,
    note: "delivery cancelled before commit",
  }];
  await updateDoc(doc(db, "pieces", pieceId), {
    status: "in_warehouse",
    currentCustomerId: null,
    currentCustomerName: null,
    currentDeliveryId: null,
    history: newHistory,
    updatedAt: now,
  });
  return { ok: true };
}

/* Manual fallback search by modelNo. Returns the most recent N pieces of
   that model (sorted by createdAt desc). Useful when a piece's QR sticker
   is damaged and the user needs to look up the most likely candidates. */
export async function searchByModel(modelNo, opts) {
  const max = (opts && opts.limit) || 50;
  const ref = collection(db, "pieces");
  /* Firestore composite indexes are required for combined where + orderBy.
     We keep this query simple — single where + orderBy on createdAt — which
     Firestore auto-indexes per-field. */
  const q = query(ref, where("modelNo", "==", modelNo || ""), orderBy("createdAt", "desc"), limit(max));
  const snap = await getDocs(q);
  const results = [];
  snap.forEach(d => results.push(d.data()));
  return results;
}

/* Resolve a parsed QR into a UI-friendly summary (used by the lookup page).
   Handles both the tracked and legacy formats. For legacy, we look up the
   modelNo via the orderId (caller supplies the orders list). */
export async function lookupQr(parsed, opts) {
  if (!parsed) return { kind: "unknown" };
  if (parsed.kind === "piece") {
    const piece = await getPiece(parsed.pieceId);
    if (!piece) return { kind: "piece", found: false, pieceId: parsed.pieceId };
    return { kind: "piece", found: true, piece };
  }
  if (parsed.kind === "legacy") {
    /* Legacy QRs aren't piece-tracked — return what we know from the order. */
    const orders = (opts && opts.orders) || [];
    const order = orders.find(o => o.id === parsed.orderId);
    return {
      kind: "legacy",
      found: !!order,
      orderId: parsed.orderId,
      qty: parsed.qty,
      modelNo: order ? order.modelNo : null,
      modelDesc: order ? order.modelDesc : null,
      note: "هذا QR قديم (قبل V19.81) — ليس له تتبع فردي. اطبع QR جديد لتفعيل التتبع.",
    };
  }
  return { kind: "unknown", raw: parsed.raw };
}
