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
