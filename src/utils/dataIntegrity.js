/* V16.64: Data integrity / referential validation
   ════════════════════════════════════════════════════════════════════════
   
   Single source of truth for "can this record be deleted safely?".
   Before deleting any record, callers ask getReferences() — which scans the
   entire data tree for inbound references and returns a list of { label, count }
   describing what's blocking. If the list is empty, deletion is safe; otherwise
   the caller blocks the action and surfaces the message via DelBtn's `blocked`
   prop or an explicit ask() popup.
   
   The goal is to prevent orphan records — e.g. deleting a customer who still
   has 3 orders or a supplier with pending shipments. Cascade-delete is NEVER
   the answer here; users should always have to clear the dependents first
   so they can see what they're losing.
   
   Adding a new entity:
   1. Add a `case` to getReferences() with the relevant scans
   2. Apply at the delete site via either a) DelBtn `blocked={getDeleteBlocker(...)}`
      or b) `if (refs.length) { tell(...) ; return }` before the upConfig call
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Scan `data` for any record that references the given (kind, id) and return
 * an array of { label, count } describing what's blocking deletion.
 * Empty array means the record is safe to delete.
 *
 * `kind` is one of:
 *   "supplier" | "customer" | "workshop" | "employee"
 *   | "treasuryTransaction" | "check"
 *
 * (More kinds — fabric, accessory, inventoryItem, season, etc. — will be
 * added in V16.65+. For now those entities use their own ad-hoc checks.)
 */
export function getReferences(data, kind, id) {
  if (!data || !id) return [];
  const refs = [];

  switch (kind) {
    case "supplier": {
      const orders = data.orders || [];
      let inOrders = 0;
      orders.forEach(o => {
        if (
          o.fabricASupplierId === id || o.fabricBSupplierId === id ||
          o.fabricCSupplierId === id || o.fabricDSupplierId === id ||
          o.accessoriesSupplierId === id
        ) inOrders++;
      });
      if (inOrders) refs.push({ label: "أوردر", count: inOrders });

      const recs = (data.purchaseReceipts || []).filter(r => r.supplierId === id);
      if (recs.length) refs.push({ label: "إذن استلام مشتريات", count: recs.length });

      const pos = (data.purchaseOrders || []).filter(p => p.supplierId === id);
      if (pos.length) refs.push({ label: "أمر شراء", count: pos.length });

      const pays = (data.supplierPayments || []).filter(p => p.supplierId === id);
      if (pays.length) refs.push({ label: "دفعة لمورد", count: pays.length });

      const tx = (data.treasury || []).filter(t => t.supplierId === id);
      if (tx.length) refs.push({ label: "حركة خزنة", count: tx.length });

      const chks = (data.checks || []).filter(c => c.type === "payable" && c.partyId === id);
      if (chks.length) refs.push({ label: "شيك", count: chks.length });

      /* defaultSupplierId on inventoryItems / fabrics / accessories */
      const dflt =
        ((data.inventoryItems || []).filter(i => i.defaultSupplierId === id).length) +
        ((data.fabrics || []).filter(f => f.defaultSupplierId === id).length) +
        ((data.accessories || []).filter(a => a.defaultSupplierId === id).length);
      if (dflt) refs.push({ label: "صنف افتراضي", count: dflt });
      break;
    }

    case "customer": {
      const inOrders = (data.orders || []).filter(o => o.custId === id).length;
      if (inOrders) refs.push({ label: "أوردر", count: inOrders });

      const sessions = (data.custDeliverySessions || []).filter(
        s => Array.isArray(s.custIds) && s.custIds.includes(id)
      ).length;
      if (sessions) refs.push({ label: "توزيعة بيع", count: sessions });

      const pays = (data.custPayments || []).filter(p => p.custId === id).length;
      if (pays) refs.push({ label: "دفعة عميل", count: pays });

      const tx = (data.treasury || []).filter(t => t.custId === id).length;
      if (tx) refs.push({ label: "حركة خزنة", count: tx });

      const chks = (data.checks || []).filter(c => c.type === "receivable" && c.partyId === id).length;
      if (chks) refs.push({ label: "شيك", count: chks });

      /* customerReturns live inside individual orders */
      let returnsCount = 0;
      (data.orders || []).forEach(o => {
        const arr = o.customerReturns || [];
        arr.forEach(r => { if (r.custId === id) returnsCount++; });
      });
      if (returnsCount) refs.push({ label: "مرتجع", count: returnsCount });
      break;
    }

    case "workshop": {
      /* Workshop is referenced by NAME (not id) in orders.workshopDeliveries[].
         We need to look up the workshop's name first. */
      const ws = (data.workshops || []).find(w => w.id === id);
      if (!ws) return [];
      const wsName = ws.name;
      if (!wsName) return [];

      let orderCount = 0;
      (data.orders || []).forEach(o => {
        const wds = o.workshopDeliveries || [];
        if (wds.some(d => d.wsName === wsName)) orderCount++;
      });
      if (orderCount) refs.push({ label: "أوردر بحركات", count: orderCount });

      const wsPays = (data.wsPayments || []).filter(p => p.wsName === wsName).length;
      if (wsPays) refs.push({ label: "دفعة ورشة", count: wsPays });

      const tx = (data.treasury || []).filter(t => t.wsName === wsName).length;
      if (tx) refs.push({ label: "حركة خزنة", count: tx });
      break;
    }

    case "employee": {
      const hr = (data.hrLog || []).filter(l => l.empId === id).length;
      if (hr) refs.push({ label: "حركة موارد بشرية", count: hr });

      let snapshotCount = 0;
      let attendanceCount = 0;
      (data.hrWeeks || []).forEach(w => {
        if (w.snapshot && w.snapshot[id]) snapshotCount++;
        const att = w.attendance || {};
        Object.keys(att).forEach(k => { if (k.startsWith(id + "_")) attendanceCount++; });
      });
      if (snapshotCount) refs.push({ label: "كشف رواتب أسبوعي", count: snapshotCount });
      if (attendanceCount) refs.push({ label: "تسجيل حضور", count: attendanceCount });

      const tx = (data.treasury || []).filter(t => t.empId === id).length;
      if (tx) refs.push({ label: "حركة خزنة", count: tx });
      break;
    }

    case "treasuryTransaction": {
      /* Block direct deletion of source-linked transactions — the user must
         delete from the original source (HR / check / etc.) so the data on
         both sides stays consistent. */
      const t = (data.treasury || []).find(x => x.id === id);
      if (!t) return [];

      if (t.checkId) {
        refs.push({
          label: "حركة شيك (احذف الشيك من تابه)",
          count: 1
        });
      }
      if (t.transferId) {
        refs.push({
          label: "تحويل بين خزن (احذف من تاب التحويلات)",
          count: 1
        });
      }
      if (t.hrLogId || t.sourceType === "hr_advance") {
        refs.push({
          label: "سلفة موظف (احذف من شاشة الموارد البشرية)",
          count: 1
        });
      }
      if (t.sourceType === "hr_salary") {
        refs.push({
          label: "اعتماد مرتبات أسبوع (احذف الأسبوع من HR)",
          count: 1
        });
      }
      if (t.sourceType === "ws_payment") {
        refs.push({
          label: "دفعة ورشة (احذف من تاب الموردين/الورش)",
          count: 1
        });
      }
      if (t.sourceType === "purchase_receipt" || t.receiptId) {
        refs.push({
          label: "إذن استلام مشتريات (احذف الإذن نفسه)",
          count: 1
        });
      }
      break;
    }

    case "check": {
      const c = (data.checks || []).find(x => x.id === id);
      if (!c) return [];
      /* Non-pending checks already left a footprint in treasury / customer
         account / supplier account. Force the user to revert status to "معلق"
         first so the side effects are unwound cleanly. */
      if (c.status && c.status !== "معلق") {
        const labels = {
          "محصل": "تم تحصيله — أرجعه لـ \"معلق\" أولاً",
          "مدفوع": "تم دفعه — أرجعه لـ \"معلق\" أولاً",
          "مُظهّر": "تم تظهيره — ألغِ التظهير أولاً",
          "مرتد": "مرتد — أرجعه لـ \"معلق\" أولاً",
          "مرتجع": "تم إلغاؤه — لا يمكن حذفه"
        };
        refs.push({
          label: labels[c.status] || ("الحالة: " + c.status),
          count: 1
        });
      }
      break;
    }

    case "fabric": {
      /* V16.66: Fabrics live in data.fabrics[] and are referenced by id from
         orders (fabricA/B/C/D fields) and by stock movements. */
      const fab = (data.fabrics || []).find(f => f.id === id);
      if (!fab) return [];

      let inOrders = 0;
      (data.orders || []).forEach(o => {
        if (o.fabricA === id || o.fabricB === id ||
            o.fabricC === id || o.fabricD === id) inOrders++;
      });
      if (inOrders) refs.push({ label: "أوردر", count: inOrders });

      const stock = Number(fab.stock) || 0;
      if (stock > 0) refs.push({ label: "رصيد بالمخزن (" + stock + ")", count: 1 });

      const movs = (data.stockMovements || []).filter(
        m => (m.itemType === "fabric" || m.itemType === "core_fabric") &&
             String(m.itemId) === String(id)
      ).length;
      if (movs) refs.push({ label: "حركة مخزن", count: movs });

      const inReceipts = (data.purchaseReceipts || []).filter(r =>
        (r.items || []).some(it =>
          (it.itemType === "fabric" || it.itemType === "core_fabric") &&
          String(it.itemId) === String(id)
        )
      ).length;
      if (inReceipts) refs.push({ label: "إذن استلام مشتريات", count: inReceipts });
      break;
    }

    case "accessory": {
      /* V16.66: Accessories live in data.accessories[] and are referenced by
         id from orders.accessories[] entries. */
      const acc = (data.accessories || []).find(a => a.id === id);
      if (!acc) return [];

      let inOrders = 0;
      (data.orders || []).forEach(o => {
        if (Array.isArray(o.accessories) &&
            o.accessories.some(a => String(a.id) === String(id))) inOrders++;
      });
      if (inOrders) refs.push({ label: "أوردر", count: inOrders });

      const stock = Number(acc.stock) || 0;
      if (stock > 0) refs.push({ label: "رصيد بالمخزن (" + stock + ")", count: 1 });

      const movs = (data.stockMovements || []).filter(
        m => (m.itemType === "accessory" || m.itemType === "core_accessory") &&
             String(m.itemId) === String(id)
      ).length;
      if (movs) refs.push({ label: "حركة مخزن", count: movs });

      const inReceipts = (data.purchaseReceipts || []).filter(r =>
        (r.items || []).some(it =>
          (it.itemType === "accessory" || it.itemType === "core_accessory") &&
          String(it.itemId) === String(id)
        )
      ).length;
      if (inReceipts) refs.push({ label: "إذن استلام مشتريات", count: inReceipts });
      break;
    }

    case "inventoryItem": {
      /* V16.66: General inventory items in data.inventoryItems[] (categorized
         by user-defined item categories, not core fabric/accessory). */
      const item = (data.inventoryItems || []).find(i => i.id === id);
      if (!item) return [];

      const stock = Number(item.stock) || 0;
      if (stock > 0) refs.push({ label: "رصيد بالمخزن (" + stock + ")", count: 1 });

      const movs = (data.stockMovements || []).filter(
        m => String(m.itemId) === String(id)
      ).length;
      if (movs) refs.push({ label: "حركة مخزن", count: movs });

      const inReceipts = (data.purchaseReceipts || []).filter(r =>
        (r.items || []).some(it => String(it.itemId) === String(id))
      ).length;
      if (inReceipts) refs.push({ label: "إذن استلام مشتريات", count: inReceipts });
      break;
    }

    case "generalProduct": {
      /* V16.66: General products are simpler than inventoryItems — they don't
         link to stock movements (no stock tracking yet) or receipts. The only
         realistic "reference" is having a non-zero balance set as opening stock. */
      const p = (data.generalProducts || []).find(x => x.id === id);
      if (!p) return [];
      const stock = Number(p.stock) || 0;
      if (stock > 0) refs.push({ label: "رصيد افتتاحي (" + stock + ")", count: 1 });
      const movs = (data.stockMovements || []).filter(
        m => String(m.itemId) === String(id)
      ).length;
      if (movs) refs.push({ label: "حركة مخزن", count: movs });
      break;
    }

    case "status": {
      /* V16.67: Status definitions in data.statusCards[] — referenced by orders.status
         (a string match on the name). Block delete if any orders use this status. */
      const st = (data.statusCards || []).find(x => x.id === id);
      if (!st) return [];
      const inOrders = (data.orders || []).filter(o => o.status === st.name).length;
      if (inOrders) refs.push({ label: "أوردر", count: inOrders });
      break;
    }

    case "garmentType": {
      /* V16.67: Garment types in data.garmentTypes[] — referenced by orders.orderPieces[]
         and by workshopDeliveries[].garmentType (both are name-based, not id-based). */
      const g = (data.garmentTypes || []).find(x => x.id === id);
      if (!g) return [];
      let inOrders = 0;
      let inDeliveries = 0;
      (data.orders || []).forEach(o => {
        if (Array.isArray(o.orderPieces) && o.orderPieces.includes(g.name)) inOrders++;
        const wds = o.workshopDeliveries || [];
        wds.forEach(wd => { if (wd.garmentType === g.name) inDeliveries++; });
      });
      if (inOrders) refs.push({ label: "أوردر", count: inOrders });
      if (inDeliveries) refs.push({ label: "تسليم ورشة", count: inDeliveries });
      break;
    }

    case "sizeSet": {
      /* V16.67: Size sets in data.sizeSets[] — referenced by orders.sizeSetId. */
      const s = (data.sizeSets || []).find(x => x.id === id);
      if (!s) return [];
      const inOrders = (data.orders || []).filter(
        o => String(o.sizeSetId) === String(s.id) || Number(o.sizeSetId) === Number(s.id)
      ).length;
      if (inOrders) refs.push({ label: "أوردر", count: inOrders });
      break;
    }

    case "itemCategory": {
      /* V16.67: User-defined item categories in data.itemCategories[]. Block delete
         if any inventoryItems are categorized under it. Core (legacy) categories
         like fabric/accessory are protected by the categories util itself. */
      const cat = (data.itemCategories || []).find(c => c.id === id);
      if (!cat) return [];
      const inItems = (data.inventoryItems || []).filter(i => i.categoryId === id).length;
      if (inItems) refs.push({ label: "صنف داخل الفئة", count: inItems });
      break;
    }

    default:
      /* Unknown kind — fail-open to preserve existing UX while new entities
         are being added. Caller's own ad-hoc check (if any) still applies. */
      return [];
  }

  return refs;
}

/**
 * Convenience wrapper: returns a single Arabic string describing what's
 * blocking deletion, or `null` if the record is safe to delete.
 *
 * Output format: "أوردر (3) • دفعة عميل (5) • شيك (1)"
 *
 * Pass directly to <DelBtn blocked={getDeleteBlocker(data, "customer", c.id)} />.
 */
export function getDeleteBlocker(data, kind, id) {
  const refs = getReferences(data, kind, id);
  if (refs.length === 0) return null;
  return refs.map(r =>
    r.count > 1 ? (r.label + " (" + r.count + ")") : r.label
  ).join(" • ");
}

/**
 * Heavier-weight version that returns a multi-line message suitable for ask()
 * popups. Use when you need to explain to the user before they confirm.
 */
export function formatBlockerMessage(data, kind, id, recordName) {
  const refs = getReferences(data, kind, id);
  if (refs.length === 0) return null;
  const header = recordName
    ? "لا يمكن حذف \"" + recordName + "\" — مرتبط بـ:"
    : "لا يمكن الحذف — السجل مرتبط بـ:";
  const lines = refs.map(r =>
    "• " + r.label + (r.count > 1 ? " (" + r.count + ")" : "")
  );
  return header + "\n" + lines.join("\n") + "\n\nاحذف الحركات المرتبطة أولاً.";
}

/* ═══════════════════════════════════════════════════════════════════════
   V18.48 — FORCE DELETE
   ───────────────────────────────────────────────────────────────────────
   Some items can't be deleted normally because they have stock movements,
   purchase receipts, or non-zero balances. The "force delete" path lets the
   user override these guards by ALSO removing the related transactional
   records (stockMovements + items inside purchaseReceipts).

   What force-delete WILL clean up:
     - The item itself (moved to recycleBin)
     - All stockMovements referencing the item
     - The item's row inside any purchaseReceipt (the receipt itself stays
       as audit trail; if it becomes empty we mark it _orphaned for review)

   What force-delete will NOT do:
     - Override usage in active orders (still blocks — would corrupt order data)
     - Reverse accounting journal entries (warn the user to review accounting)
     - Cascade-delete suppliers/customers/etc. (that's a different kind)

   Public API:
     canForceDelete(data, kind, id) → {ok, reason?}
     forceDeleteCleanup(d, kind, id) → mutator for upConfig
     summarizeForceDelete(data, kind, id) → {moveCount, receiptItemCount, ...}
   ═══════════════════════════════════════════════════════════════════════ */

/* The kinds that support force-delete. These are stock items where the
   blockers are mostly about stock movements + receipts.
   Parties (supplier/customer/workshop/employee) and check kinds are NOT
   force-deletable because cascading their refs would be too destructive. */
const FORCE_DELETABLE_KINDS = new Set([
  "fabric", "accessory", "inventoryItem", "generalProduct",
]);

/* Hard-block: item used in any order. We never force-override this because
   removing the item from data while orders still reference it would break
   order calculations and history. The user must clean up orders first. */
function isUsedInAnyOrder(data, kind, id) {
  const orders = data.orders || [];
  const sid = String(id);
  switch (kind) {
    case "fabric": {
      /* Orders use FKEYS A, B, C, ...; each fabric "key" stores name as f<KEY>name */
      /* But fabric in our system is identified by its ID inside data.fabrics */
      const fab = (data.fabrics || []).find(f => f.id === id);
      if (!fab) return false;
      const fabName = (fab.name || "").trim().toLowerCase();
      return orders.some(o =>
        ["A","B","C","D","E","F","G","H"].some(k => {
          const n = String(o["f"+k+"name"] || "").trim().toLowerCase();
          return n && n === fabName;
        })
      );
    }
    case "accessory": {
      return orders.some(o =>
        Array.isArray(o.accessories) &&
        o.accessories.some(a => String(a.id) === sid)
      );
    }
    case "inventoryItem":
    case "generalProduct":
      /* These aren't directly referenced by orders' core fields */
      return false;
    default:
      return false;
  }
}

/* Returns {ok:true} if the force-delete is safe to proceed, or
   {ok:false, reason} if a hard-block applies. */
export function canForceDelete(data, kind, id) {
  if (!FORCE_DELETABLE_KINDS.has(kind)) {
    return { ok: false, reason: "هذا النوع لا يدعم الحذف بالقوة" };
  }
  if (isUsedInAnyOrder(data, kind, id)) {
    return {
      ok: false,
      reason: "العنصر مُستخدم في أوردر — لا يمكن حذفه حتى مع الحذف بالقوة لأن ذلك سيعطّل حسابات الأوردر. أزل العنصر من الأوردرات أولاً.",
    };
  }
  return { ok: true };
}

/* Build a human-readable summary of what force-delete will affect. */
export function summarizeForceDelete(data, kind, id) {
  const sid = String(id);
  const moves = (data.stockMovements || []).filter(m => {
    if (kind === "fabric")        return (m.itemType === "fabric" || m.itemType === "core_fabric") && String(m.itemId) === sid;
    if (kind === "accessory")     return (m.itemType === "accessory" || m.itemType === "core_accessory") && String(m.itemId) === sid;
    if (kind === "inventoryItem") return m.itemType === "inventory" && String(m.itemId) === sid;
    if (kind === "generalProduct")return m.itemType === "general" && String(m.itemId) === sid;
    return false;
  });

  const receiptItems = [];
  (data.purchaseReceipts || []).forEach(r => {
    (r.items || []).forEach(it => {
      const matchesKind = (
        (kind === "fabric"        && (it.itemType === "fabric" || it.itemType === "core_fabric")) ||
        (kind === "accessory"     && (it.itemType === "accessory" || it.itemType === "core_accessory")) ||
        (kind === "inventoryItem" && it.itemType === "inventory") ||
        (kind === "generalProduct"&& it.itemType === "general")
      );
      if (matchesKind && String(it.itemId) === sid) {
        receiptItems.push({ receiptId: r.id, receiptNo: r.receiptNo || r.id });
      }
    });
  });

  /* Stock balance shown in the source list (non-derived) */
  const sourceList = (
    kind === "fabric" ? (data.fabrics || []) :
    kind === "accessory" ? (data.accessories || []) :
    kind === "inventoryItem" ? (data.inventoryItems || []) :
    kind === "generalProduct" ? (data.generalProducts || []) : []
  );
  const item = sourceList.find(x => String(x.id) === sid);
  const stock = item ? (Number(item.stock) || 0) : 0;

  return {
    moveCount: moves.length,
    receiptItemCount: receiptItems.length,
    affectedReceipts: [...new Set(receiptItems.map(r => r.receiptNo))],
    currentStock: stock,
  };
}

/* The mutator. Pass to upConfig like:
     upConfig(d => { forceDeleteCleanup(d, "accessory", id); });
   Idempotent: running twice is safe (second run no-ops). */
export function forceDeleteCleanup(d, kind, id) {
  if (!d || !FORCE_DELETABLE_KINDS.has(kind)) return;
  const sid = String(id);

  /* Match logic shared between collections + receipts */
  const matchesItemType = (it) => {
    if (kind === "fabric")        return it.itemType === "fabric" || it.itemType === "core_fabric";
    if (kind === "accessory")     return it.itemType === "accessory" || it.itemType === "core_accessory";
    if (kind === "inventoryItem") return it.itemType === "inventory";
    if (kind === "generalProduct")return it.itemType === "general";
    return false;
  };

  /* 1. Remove the source item itself + record in recycleBin */
  const sourceKey = (
    kind === "fabric" ? "fabrics" :
    kind === "accessory" ? "accessories" :
    kind === "inventoryItem" ? "inventoryItems" :
    "generalProducts"
  );
  const arabicLabel = (
    kind === "fabric" ? "قماش" :
    kind === "accessory" ? "اكسسوار" :
    kind === "inventoryItem" ? "صنف مخزن" :
    "منتج عام"
  );
  if (Array.isArray(d[sourceKey])) {
    const idx = d[sourceKey].findIndex(x => String(x.id) === sid);
    if (idx >= 0) {
      const removed = d[sourceKey][idx];
      if (!Array.isArray(d.recycleBin)) d.recycleBin = [];
      d.recycleBin.unshift({
        ...removed,
        _type: arabicLabel,
        _collection: sourceKey,
        _deletedAt: new Date().toISOString(),
        _forceDeleted: true,
      });
      d[sourceKey].splice(idx, 1);
      if (d.recycleBin.length > 100) d.recycleBin = d.recycleBin.slice(0, 100);
    }
  }

  /* 2. Remove related stockMovements */
  if (Array.isArray(d.stockMovements)) {
    d.stockMovements = d.stockMovements.filter(m =>
      !(matchesItemType(m) && String(m.itemId) === sid)
    );
  }

  /* 3. Strip the item from purchaseReceipts; if a receipt becomes empty,
     mark it _orphaned (don't delete — keep audit trail). */
  if (Array.isArray(d.purchaseReceipts)) {
    d.purchaseReceipts = d.purchaseReceipts.map(r => {
      if (!Array.isArray(r.items)) return r;
      const beforeCount = r.items.length;
      const newItems = r.items.filter(it =>
        !(matchesItemType(it) && String(it.itemId) === sid)
      );
      if (newItems.length === beforeCount) return r;/* unchanged */
      const next = { ...r, items: newItems };
      if (newItems.length === 0) next._orphaned = true;
      return next;
    });
  }
}

