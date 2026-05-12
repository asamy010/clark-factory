/* ═══════════════════════════════════════════════════════════════════════
   CLARK · Purchase Pipeline Orders Utility (V21.10.6 — #3 Slices 7+8)
   ───────────────────────────────────────────────────────────────────────
   Mirror of salesOrders.js for the Purchase side. "Pipeline POs" are the
   Odoo-style document-chain purchase orders (distinct from the V19.50
   receipt-based purchaseOrders array). Stock impact is RECEIVE (+qty) not
   deduct.

   Status workflow:
     draft → confirmed → partial_received → fully_received → invoiced
                      ↘ cancelled (reverses stock receipt)

   Naming distinction:
     data.purchaseOrders      → V19.50 receipt-based (legacy, in factory/config + daily split)
     data.purchasePipelineOrders → V21.10.6 new chain (separate array + daily split)
     Counter: PPO-YYYY-NNNN (Pipeline Purchase Order)

   --- Schema ---
   data.purchasePipelineOrders = [{
     id, orderNo: "PPO-2026-0001",
     date,
     supplierId, supplierName, supplierPhone,
     items: [{ sourceType ("generalProduct"|"fabric"|"accessory"|"service"),
               sourceId, modelNo, description, qty, unitPrice,
               lineSubtotal, lineDiscount, lineTotal, receivedQty }],
     subtotal, discountPct, totalDiscount, total,
     status,
     fromRFQId, fromRFQNo,
     purchaseInvoiceId, purchaseInvoiceNo,
     stockReceived: bool,
     stockMovementIds: [],
     receivedAt, receivedBy,
     cancelledAt, cancelledBy, cancelReason,
     statusHistory, notes, requestedBy, createdAt, createdBy,
   }]
   data.purchasePipelineOrderCounters = { 2026: 1 }
   data.purchasePipelineSettings = { allowNegativeStock: false }
   ═══════════════════════════════════════════════════════════════════════ */

import { r2 } from "../format.js";

const PREFIX = "PPO";

export function nextPipelinePONo(data){
  const year = new Date().getFullYear();
  const next = ((data.purchasePipelineOrderCounters || {})[year] || 0) + 1;
  return `${PREFIX}-${year}-${String(next).padStart(4, "0")}`;
}

export function reservePipelinePONo(d){
  if(!d.purchasePipelineOrderCounters) d.purchasePipelineOrderCounters = {};
  const year = new Date().getFullYear();
  const next = (d.purchasePipelineOrderCounters[year] || 0) + 1;
  d.purchasePipelineOrderCounters[year] = next;
  return `${PREFIX}-${year}-${String(next).padStart(4, "0")}`;
}

/* Convert an RFQ to a Pipeline PO. RFQ is flipped to "converted". */
export function convertRFQToPipelinePOMutator(d, rfqId, userName){
  const r = (d.purchaseRFQs || []).find(x => x.id === rfqId);
  if(!r) throw new Error("الطلب غير موجود");
  if(["converted","rejected","expired"].includes(r.status)){
    throw new Error(`لا يمكن تحويل طلب في حالة "${r.status}"`);
  }
  if(r.convertedToPipelinePOId){
    throw new Error("الطلب ده محوّل بالفعل لأمر شراء");
  }

  const orderNo = reservePipelinePONo(d);
  const id = "ppo_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7);
  const date = new Date().toISOString().split("T")[0];

  const ppo = {
    id, orderNo, date,
    supplierId: r.supplierId,
    supplierName: r.supplierName,
    supplierPhone: r.supplierPhone,
    items: (r.items || []).map(it => ({ ...it, receivedQty: 0 })),
    subtotal: r.subtotal,
    discountPct: r.discountPct,
    totalDiscount: r.totalDiscount,
    total: r.total,
    status: "draft",
    fromRFQId: r.id,
    fromRFQNo: r.rfqNo,
    purchaseInvoiceId: null,
    purchaseInvoiceNo: null,
    stockReceived: false,
    stockMovementIds: [],
    notes: r.notes || "",
    requestedBy: r.requestedBy || userName || "",
    statusHistory: [{ from: null, to: "draft", at: new Date().toISOString(), by: userName || "", note: "محوّل من طلب " + r.rfqNo }],
    createdAt: new Date().toISOString(),
    createdBy: userName || "",
  };

  if(!Array.isArray(d.purchasePipelineOrders)) d.purchasePipelineOrders = [];
  d.purchasePipelineOrders.push(ppo);

  /* Back-link on the RFQ */
  r.status = "converted";
  r.convertedToPipelinePOId = ppo.id;
  r.convertedToPipelinePONo = ppo.orderNo;
  r.convertedAt = new Date().toISOString();
  r.convertedBy = userName || "";
  if(!Array.isArray(r.statusHistory)) r.statusHistory = [];
  r.statusHistory.push({ from: r.statusHistory.at(-1)?.to || "?", to: "converted", at: r.convertedAt, by: userName || "" });

  return ppo;
}

/* Build a Pipeline PO directly (no parent RFQ). */
export function buildPipelinePO(d, args){
  const { supplier, items, subtotal, totalDiscount, total, documentDiscountPct, notes, requestedBy, userName } = args;
  if(!supplier || !supplier.id) throw new Error("اختر المورد");
  if(!items || items.length === 0) throw new Error("أضف بنود");
  const orderNo = reservePipelinePONo(d);
  return {
    id: "ppo_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7),
    orderNo,
    date: new Date().toISOString().split("T")[0],
    supplierId: supplier.id,
    supplierName: supplier.name || "",
    supplierPhone: supplier.phone || "",
    items: items.map(it => ({ ...it, receivedQty: 0 })),
    subtotal,
    discountPct: documentDiscountPct || 0,
    totalDiscount, total,
    status: "draft",
    fromRFQId: null, fromRFQNo: null,
    purchaseInvoiceId: null, purchaseInvoiceNo: null,
    stockReceived: false,
    stockMovementIds: [],
    notes: notes || "",
    requestedBy: requestedBy || userName || "",
    statusHistory: [{ from: null, to: "draft", at: new Date().toISOString(), by: userName || "" }],
    createdAt: new Date().toISOString(),
    createdBy: userName || "",
  };
}

/* Confirm + receive stock for a Pipeline PO. ADDS to inventory (opposite of
   sales SO which deducts). Currently handles:
     - generalProduct: data.generalProducts[i].stock += qty
     - fabric: data.fabrics[i].stock += qty
     - accessory: data.accessories[i].stock += qty
     - service: no impact
   Each receive creates a stockMovement entry with type="in" and source="ppo_receive". */
export function receivePipelinePOMutator(d, ppoId, userName, options = {}){
  const ppo = (d.purchasePipelineOrders || []).find(x => x.id === ppoId);
  if(!ppo) throw new Error("أمر الشراء غير موجود");
  if(ppo.status === "fully_received" || ppo.status === "invoiced") return ppo;
  if(["cancelled"].includes(ppo.status)) throw new Error(`لا يمكن استلام أمر شراء ملغي`);

  const today = new Date().toISOString().split("T")[0];
  const stockMovementIds = ppo.stockMovementIds ? [...ppo.stockMovementIds] : [];

  (ppo.items || []).forEach(it => {
    const qty = Number(it.qty) || 0;
    if(qty <= 0) return;
    /* Skip already-received items (idempotency on retry) */
    if(Number(it.receivedQty) >= qty) return;
    const toReceive = qty - (Number(it.receivedQty) || 0);

    let p = null;
    let unit = "";
    let itemKind = "";
    if(it.sourceType === "generalProduct"){
      p = (d.generalProducts || []).find(x => x.id === it.sourceId);
      itemKind = "generalProduct";
      unit = p?.unit || "";
    } else if(it.sourceType === "fabric"){
      p = (d.fabrics || []).find(x => x.id === it.sourceId);
      itemKind = "fabric";
      unit = p?.unit || "";
    } else if(it.sourceType === "accessory"){
      p = (d.accessories || []).find(x => x.id === it.sourceId);
      itemKind = "accessory";
      unit = p?.unit || "";
    } else {
      /* service — no stock impact */
      it.receivedQty = qty;
      return;
    }

    if(!p) return;
    const before = Number(p.stock) || 0;
    p.stock = before + toReceive;
    p.lastMovementDate = today;
    /* Update avgCost for generalProduct using weighted avg if applicable */
    if(itemKind === "generalProduct" && Number(it.unitPrice) > 0){
      const oldAvg = Number(p.avgCost) || 0;
      const newAvg = before > 0 ? r2(((oldAvg * before) + (it.unitPrice * toReceive)) / (before + toReceive)) : it.unitPrice;
      p.avgCost = newAvg;
    }

    const movId = "smv_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7);
    if(!Array.isArray(d.stockMovements)) d.stockMovements = [];
    d.stockMovements.push({
      id: movId,
      date: today,
      type: "in",
      source: "purchase_pipeline_receive",
      sourceId: ppo.id,
      sourceRef: ppo.orderNo,
      itemKind,
      itemId: p.id,
      itemName: p.name,
      qty: toReceive,
      stockBefore: before,
      stockAfter: before + toReceive,
      unit,
      unitCost: Number(it.unitPrice) || 0,
      createdAt: new Date().toISOString(),
      createdBy: userName || "",
    });
    stockMovementIds.push(movId);
    it.receivedQty = qty;
  });

  const prev = ppo.status;
  ppo.status = "fully_received";
  ppo.stockReceived = stockMovementIds.length > 0;
  ppo.stockMovementIds = stockMovementIds;
  ppo.receivedAt = new Date().toISOString();
  ppo.receivedBy = userName || "";
  if(!Array.isArray(ppo.statusHistory)) ppo.statusHistory = [];
  ppo.statusHistory.push({ from: prev, to: "fully_received", at: ppo.receivedAt, by: userName || "" });

  return ppo;
}

/* Cancel — reverses stock receipt if any. */
export function cancelPipelinePOMutator(d, ppoId, userName, reason){
  const ppo = (d.purchasePipelineOrders || []).find(x => x.id === ppoId);
  if(!ppo) throw new Error("أمر الشراء غير موجود");
  if(ppo.status === "cancelled") return ppo;
  if(["invoiced"].includes(ppo.status)){
    throw new Error(`لا يمكن إلغاء أمر شراء تم فوترته`);
  }
  const today = new Date().toISOString().split("T")[0];

  if(ppo.stockReceived){
    (ppo.items || []).forEach(it => {
      if(it.sourceType === "service") return;
      const recv = Number(it.receivedQty) || 0;
      if(recv <= 0) return;

      let p = null;
      let itemKind = "";
      let unit = "";
      if(it.sourceType === "generalProduct"){
        p = (d.generalProducts || []).find(x => x.id === it.sourceId); itemKind = "generalProduct";
      } else if(it.sourceType === "fabric"){
        p = (d.fabrics || []).find(x => x.id === it.sourceId); itemKind = "fabric";
      } else if(it.sourceType === "accessory"){
        p = (d.accessories || []).find(x => x.id === it.sourceId); itemKind = "accessory";
      }
      if(!p) return;
      unit = p?.unit || "";
      const before = Number(p.stock) || 0;
      p.stock = before - recv;
      p.lastMovementDate = today;

      const movId = "smv_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7);
      if(!Array.isArray(d.stockMovements)) d.stockMovements = [];
      d.stockMovements.push({
        id: movId,
        date: today,
        type: "out",
        source: "purchase_pipeline_cancel",
        sourceId: ppo.id,
        sourceRef: ppo.orderNo,
        itemKind,
        itemId: p.id,
        itemName: p.name,
        qty: recv,
        stockBefore: before,
        stockAfter: before - recv,
        unit,
        notes: "إلغاء أمر شراء — عكس استلام المخزون",
        createdAt: new Date().toISOString(),
        createdBy: userName || "",
      });
      it.receivedQty = 0;
    });
    ppo.stockReceived = false;
  }

  const prev = ppo.status;
  ppo.status = "cancelled";
  ppo.cancelledAt = new Date().toISOString();
  ppo.cancelledBy = userName || "";
  ppo.cancelReason = reason || "";
  if(!Array.isArray(ppo.statusHistory)) ppo.statusHistory = [];
  ppo.statusHistory.push({ from: prev, to: "cancelled", at: ppo.cancelledAt, by: userName || "", note: reason || "" });

  return ppo;
}

export function deleteDraftPipelinePOMutator(d, ppoId){
  if(!Array.isArray(d.purchasePipelineOrders)) return;
  const ppo = d.purchasePipelineOrders.find(x => x.id === ppoId);
  if(!ppo) return;
  if(ppo.status !== "draft") throw new Error("لا يمكن حذف أمر شراء بعد التأكيد — اعمل إلغاء بدلاً");
  d.purchasePipelineOrders = d.purchasePipelineOrders.filter(x => x.id !== ppoId);
}

/* Create a Purchase Invoice (draft) from a received Pipeline PO.
   Mirrors createInvoiceFromSalesOrderMutator but for the Purchase side. */
export function createPurchaseInvoiceFromPipelinePOMutator(d, ppoId, userName){
  const ppo = (d.purchasePipelineOrders || []).find(x => x.id === ppoId);
  if(!ppo) throw new Error("أمر الشراء غير موجود");
  if(!["fully_received","partial_received"].includes(ppo.status)){
    throw new Error(`لا يمكن إنشاء فاتورة من أمر شراء في حالة "${ppo.status}"`);
  }
  if(ppo.purchaseInvoiceId){
    throw new Error(`أمر الشراء عنده فاتورة بالفعل: ${ppo.purchaseInvoiceNo}`);
  }

  /* Reserve invoice number — PINV-YYYY-NNNN (existing counter from V18.65). */
  if(!d.invoiceCounters) d.invoiceCounters = {};
  if(!d.invoiceCounters.purchase) d.invoiceCounters.purchase = {};
  const year = new Date().getFullYear();
  const nextNum = (d.invoiceCounters.purchase[year] || 0) + 1;
  d.invoiceCounters.purchase[year] = nextNum;
  const invoiceNo = `PINV-${year}-${String(nextNum).padStart(4, "0")}`;

  const today = new Date().toISOString().split("T")[0];
  const invoice = {
    id: "pinv_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7),
    invoiceNo,
    type: "purchase",
    supplierId: ppo.supplierId,
    supplierName: ppo.supplierName,
    date: today,
    receiptRefs: [],/* not from a receipt — from a Pipeline PO */
    fromPipelinePOId: ppo.id,
    fromPipelinePONo: ppo.orderNo,
    fromRFQId: ppo.fromRFQId || null,
    fromRFQNo: ppo.fromRFQNo || null,
    items: (ppo.items || []).map(it => ({
      modelNo: it.modelNo || "",
      modelDesc: it.description || "",
      qty: Number(it.receivedQty) || Number(it.qty) || 0,
      unitPrice: Number(it.unitPrice) || 0,
      lineTotal: Number(it.lineTotal) || 0,
      sourceType: it.sourceType,
      sourceId: it.sourceId,
    })),
    subtotal: Number(ppo.subtotal) || 0,
    discountPct: Number(ppo.discountPct) || 0,
    discount: Number(ppo.totalDiscount) || 0,
    total: Number(ppo.total) || 0,
    status: "draft",
    notes: ppo.notes || "",
    createdAt: new Date().toISOString(),
    createdBy: userName || "",
  };

  if(!Array.isArray(d.purchaseInvoices)) d.purchaseInvoices = [];
  d.purchaseInvoices.push(invoice);

  ppo.purchaseInvoiceId = invoice.id;
  ppo.purchaseInvoiceNo = invoice.invoiceNo;
  const prev = ppo.status;
  ppo.status = "invoiced";
  if(!Array.isArray(ppo.statusHistory)) ppo.statusHistory = [];
  ppo.statusHistory.push({ from: prev, to: "invoiced", at: new Date().toISOString(), by: userName || "", note: "فاتورة " + invoice.invoiceNo });

  /* Forward-link on the RFQ chain */
  if(ppo.fromRFQId){
    const r = (d.purchaseRFQs || []).find(x => x.id === ppo.fromRFQId);
    if(r){
      r.linkedPurchaseInvoiceId = invoice.id;
      r.linkedPurchaseInvoiceNo = invoice.invoiceNo;
    }
  }

  return invoice;
}

export function getPipelinePOStats(data, filters = {}){
  const list = (data.purchasePipelineOrders || []).filter(o => {
    if(filters.from && (o.date || "") < filters.from) return false;
    if(filters.to && (o.date || "") > filters.to) return false;
    if(filters.partyId && o.supplierId !== filters.partyId) return false;
    if(filters.status && filters.status !== "all" && o.status !== filters.status) return false;
    return true;
  });
  return {
    count: list.length,
    totalValue: r2(list.reduce((s, o) => s + (Number(o.total) || 0), 0)),
    draft:              list.filter(o => o.status === "draft").length,
    confirmed:          list.filter(o => o.status === "confirmed").length,
    partial_received:   list.filter(o => o.status === "partial_received").length,
    fully_received:     list.filter(o => o.status === "fully_received").length,
    invoiced:           list.filter(o => o.status === "invoiced").length,
    cancelled:          list.filter(o => o.status === "cancelled").length,
  };
}
