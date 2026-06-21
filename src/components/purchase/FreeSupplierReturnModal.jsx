/* ═══════════════════════════════════════════════════════════════════════
   CLARK · FreeSupplierReturnModal (V21.27.83 — بند-بند)
   ───────────────────────────────────────────────────────────────────────
   مرتجع حر للمورد — مش مربوط باستلام واحد. طلب Ahmed:
   «أنزّل المرتجع بند-بند زي الطبيعي، ولما أختار الصنف في القايمة يظهر بس
    الأصناف اللي اشتريتها من المورد ده — مش كل الأصناف».

   • تختار المورد → قائمة المنتجات في محرّر البنود (DocLineEditor) بتتحصر في
     الأصناف اللي تم استلامها منه فقط (مع «المتبقي للإرجاع» تحت كل صنف).
   • تضيف بند-بند عادي (+ إضافة منتج) وتكتب الكمية.
   • عند التأكيد:
       - يطلع المخزون (applyStockDelta سالب + حركة purchase_return) لو المخزن مفعّل.
       - يعمل/يدمج إشعار مدين (upsertDebitNoteFromReturn).
       - يوزّع الكمية المرتجعة على استلامات المورد (FIFO) في receipt._returns —
         عشان returnedByLine يفضل متّسق. الكميات تتقصّ على «المتبقي» لكل صنف.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, SearchSel } from "../ui.jsx";
import { DocLineEditor } from "../sales/DocLineEditor.jsx";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { fmt, r2, gid } from "../../utils/format.js";
import { ask, tell, showToast } from "../../utils/popups.js";
import { applyStockDelta, getCategoryById } from "../../utils/categories.js";
import { upsertDebitNoteFromReturn } from "../../utils/invoices.js";

export function FreeSupplierReturnModal({ data, upConfig, user, onClose, onCreated, isMob }){
  const userName = user?.displayName || (user?.email || "").split("@")[0] || "";
  const suppliers = data.suppliers || [];
  const purchaseReceipts = data.purchaseReceipts || [];
  const stockEnabled = !!(data.purchaseSettings && data.purchaseSettings.stockEnabled);
  const today2 = new Date().toISOString().split("T")[0];

  const [supplierId, setSupplierId] = useState("");
  const [items, setItems] = useState([]);     /* DocLineEditor items */
  const [reason, setReason] = useState("");

  /* أصناف المورد المستلَمة (مفتاح itemType:itemId) → مستلم/مرتجع سابق/متبقّي/متوسط سعر */
  const recvMap = useMemo(() => {
    const map = {};
    if(!supplierId) return map;
    purchaseReceipts
      .filter(r => String(r.supplierId) === String(supplierId))
      .forEach(r => {
        (r.items || []).forEach(it => {
          if(!it || it.itemId == null) return;
          const key = String(it.itemType) + ":" + String(it.itemId);
          if(!map[key]) map[key] = { key, itemType: it.itemType, itemId: it.itemId, itemName: it.itemName || "", unit: it.unit || "", recd: 0, returned: 0, _cost: 0, _q: 0 };
          const q = Number(it.qty) || 0, p = Number(it.price) || 0;
          map[key].recd += q; map[key]._cost += q * p; map[key]._q += q;
        });
        (r._returns || []).forEach(x => {
          if(!x || x.itemId == null) return;
          const key = String(x.itemType) + ":" + String(x.itemId);
          if(map[key]) map[key].returned += Number(x.qty) || 0;
        });
      });
    Object.values(map).forEach(m => { m.avgPrice = m._q > 0 ? r2(m._cost / m._q) : 0; m.remaining = Math.max(0, r2(m.recd - m.returned)); });
    return map;
  }, [supplierId, purchaseReceipts]);

  /* قائمة المنتجات للمحرّر — أصناف المورد اللي لسه ليها متبقّي للإرجاع فقط */
  const productOptions = useMemo(() => Object.values(recvMap)
    .filter(m => m.remaining > 0)
    .sort((a, b) => String(a.itemName).localeCompare(String(b.itemName), "ar"))
    .map(m => ({ value: m.key, label: m.itemName + " — متبقٍ: " + fmt(m.remaining) + (m.unit ? " " + m.unit : "") })),
    [recvMap]);

  const resolveProduct = (value) => {
    const m = recvMap[String(value)];
    if(!m) return {};
    return { sourceType: m.itemType, sourceId: m.itemId, modelNo: m.itemName, description: "", unit: m.unit || "", unitPrice: Number(m.avgPrice) || 0 };
  };
  /* «المتبقي للإرجاع» تحت كل بند */
  const stockInfo = (it) => {
    if(!it || it.isSection || !it.sourceId) return null;
    const m = recvMap[String(it.sourceType) + ":" + String(it.sourceId)];
    if(!m) return null;
    return { qty: m.remaining, unit: m.unit || "", label: "المتبقي للإرجاع" };
  };

  const lineTotal = (it) => (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
  const totalVal = items.reduce((s, it) => s + (it.isSection ? 0 : lineTotal(it)), 0);

  const confirm = async () => {
    /* جمّع البنود حسب الصنف وقصّها على المتبقّي */
    const agg = {};
    items.forEach(it => {
      if(it.isSection || !it.sourceId) return;
      const key = String(it.sourceType) + ":" + String(it.sourceId);
      const q = Number(it.qty) || 0;
      if(q <= 0) return;
      if(!agg[key]) agg[key] = { itemType: it.sourceType, itemId: it.sourceId, itemName: it.modelNo || it.description || "", qty: 0, unitPrice: Number(it.unitPrice) || 0 };
      agg[key].qty += q;
    });
    let clamped = false;
    const picked = Object.entries(agg).map(([key, v]) => {
      const m = recvMap[key];
      const cap = m ? m.remaining : v.qty;
      if(v.qty > cap + 0.0001) clamped = true;
      return { ...v, qty: Math.min(v.qty, cap), avgPrice: v.unitPrice };
    }).filter(x => x.qty > 0);

    if(picked.length === 0){ await tell("لا توجد بنود", "أضف بند واحد على الأقل بكمية أكبر من صفر من أصناف المورد", { type: "warning" }); return; }

    const supplier = suppliers.find(s => String(s.id) === String(supplierId));
    const tVal = picked.reduce((s, x) => s + x.qty * (Number(x.avgPrice) || 0), 0);
    const ok = await ask(
      "تأكيد مرتجع المورد",
      "مرتجع " + picked.length + " بند للمورد «" + (supplier?.name || "—") + "» بقيمة " + fmt(r2(tVal)) + " ج.م." +
      (clamped ? "\n\n⚠️ بعض الكميات اتقصّت على «المتبقي للإرجاع» (مينفعش ترجّع أكتر من اللي استلمته)." : "") +
      "\n\n" + (stockEnabled ? "• هتطلع البضاعة من المخزن.\n" : "") + "• هيتعمل إشعار مدين يقلّل المستحق للمورد.\n\nمتابعة؟",
      { confirmText: "تأكيد المرتجع" }
    );
    if(!ok) return;

    let dnNo = "";
    upConfig(d => {
      if(!Array.isArray(d.stockMovements)) d.stockMovements = [];
      const supplier2 = (d.suppliers || []).find(s => String(s.id) === String(supplierId));

      if(stockEnabled){
        picked.forEach(it => {
          let catId = it.itemType; if(catId === "fabric") catId = "core_fabric"; else if(catId === "accessory") catId = "core_accessory";
          applyStockDelta(d, catId, it.itemId, -it.qty, null);
          const cat = getCategoryById(d, catId);
          if(cat?.legacy === "fabric"){ const f = (d.fabrics || []).find(x => String(x.id) === String(it.itemId)); if(f && f.stock < 0) f.stock = 0; }
          else if(cat?.legacy === "accessory"){ const a = (d.accessories || []).find(x => String(x.id) === String(it.itemId)); if(a && a.stock < 0) a.stock = 0; }
          else { const x = (d.inventoryItems || []).find(y => String(y.id) === String(it.itemId)); if(x && x.stock < 0) x.stock = 0; }
          d.stockMovements.push({ id: gid(), type: "out", itemType: it.itemType, itemId: it.itemId, itemName: it.itemName || "", qty: -it.qty, unit: "", price: Number(it.avgPrice) || 0, date: today2, sourceType: "purchase_return", sourceId: null, notes: "مرتجع حر للمورد — " + (supplier2?.name || ""), createdBy: userName, createdAt: new Date().toISOString() });
        });
      }

      const res = upsertDebitNoteFromReturn(d, {
        supplierId, supplierName: supplier2?.name || "", date: today2,
        items: picked.map(it => ({ itemType: it.itemType, itemId: it.itemId, itemName: it.itemName, name: it.itemName, qty: it.qty, unitPrice: Number(it.avgPrice) || 0 })),
        notes: (reason || "").trim() || "مرتجع حر للمورد",
      }, supplier2, userName);
      dnNo = res && res.debitNote ? res.debitNote.debitNoteNo : "";
      const dnId = res && res.debitNote ? res.debitNote.id : "";

      picked.forEach(it => {
        let left = it.qty;
        const recIds = (d.purchaseReceipts || [])
          .filter(r => String(r.supplierId) === String(supplierId) && (r.items || []).some(x => String(x.itemType) === String(it.itemType) && String(x.itemId) === String(it.itemId)))
          .sort((a, b) => (a.date || "").localeCompare(b.date || "")).map(r => r.id);
        for(const rid of recIds){
          if(left <= 0) break;
          const ri = (d.purchaseReceipts || []).findIndex(x => x.id === rid); if(ri < 0) continue;
          const rr = d.purchaseReceipts[ri]; if(!Array.isArray(rr._returns)) rr._returns = [];
          const recd = (rr.items || []).filter(x => String(x.itemType) === String(it.itemType) && String(x.itemId) === String(it.itemId)).reduce((s, x) => s + (Number(x.qty) || 0), 0);
          const done = rr._returns.filter(x => String(x.itemType) === String(it.itemType) && String(x.itemId) === String(it.itemId)).reduce((s, x) => s + (Number(x.qty) || 0), 0);
          const take = Math.min(left, Math.max(0, recd - done));
          if(take > 0){ rr._returns.push({ itemType: it.itemType, itemId: it.itemId, itemName: it.itemName, qty: take, price: Number(it.avgPrice) || 0, date: today2, debitNoteId: dnId, by: userName, at: new Date().toISOString(), _free: true }); left -= take; }
        }
      });
    });

    showToast("✅ تم المرتجع — إشعار مدين " + dnNo + (stockEnabled ? " + خصم المخزن" : ""));
    onCreated && onCreated();
    onClose();
  };

  /* zIndex 99998: تحت بوب اب التأكيد (ask=100000) والتوست عشان «تأكيد المرتجع» يظهر فوق المودال (V21.27.85) */
  return (
    <div className="pop-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 99998, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => { if(e.target === e.currentTarget) onClose(); }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.cardSolid, borderRadius: 16, padding: 20, width: "100%", maxWidth: 880, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: FS + 2, fontWeight: 800, color: "#3B82F6" }}>↪️ مرتجع مورد (حر)</div>
          <Btn ghost small onClick={onClose}>✕</Btn>
        </div>

        <div style={{ flex: 1, overflowY: "auto", paddingInlineEnd: 4 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600, marginBottom: 4, display: "block" }}>المورد <span style={{ color: T.err }}>*</span></label>
            <SearchSel value={supplierId} onChange={v => { setSupplierId(v); setItems([]); }} options={suppliers.map(s => ({ value: s.id, label: s.name }))} placeholder="ابحث عن المورد..." />
            <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 4 }}>القايمة هتعرض بس الأصناف اللي تم استلامها من المورد ده (واللي ليها متبقّي للإرجاع).</div>
          </div>

          {!supplierId ? (
            <div style={{ padding: 30, textAlign: "center", color: T.textMut, background: T.bg, borderRadius: 10, border: "1px dashed " + T.brd }}>اختر المورد الأول</div>
          ) : productOptions.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", color: T.warn, background: T.warn + "08", borderRadius: 10, border: "1px solid " + T.warn + "30" }}>لا توجد أصناف قابلة للإرجاع من هذا المورد (مفيش استلامات أو كله اترجّع).</div>
          ) : (
            <>
              <label style={{ fontSize: FS, color: T.text, fontWeight: 700, display: "block", marginBottom: 8 }}>بنود المرتجع</label>
              <DocLineEditor items={items} setItems={setItems} productOptions={productOptions} resolveProduct={resolveProduct} isMob={isMob} accent="#3B82F6" stockInfo={stockInfo} />

              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600, display: "block", marginBottom: 4 }}>سبب المرتجع (اختياري)</label>
                <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="مثلاً: تالف / مخالف للمواصفات..." style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid " + T.brd, fontSize: FS - 1, fontFamily: "inherit", background: T.cardSolid, color: T.text, boxSizing: "border-box", resize: "vertical", minHeight: 50 }} />
              </div>
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 12, borderTop: "1px solid " + T.brd, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 800, color: T.text }}>إجمالي المرتجع: <span style={{ color: "#3B82F6" }}>{fmt(r2(totalVal))} ج.م</span></div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn ghost onClick={onClose}>إلغاء</Btn>
            <Btn primary onClick={confirm} disabled={totalVal <= 0} style={{ background: "#3B82F6", color: "#fff", border: "none" }}>↪️ تأكيد المرتجع (إشعار مدين)</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FreeSupplierReturnModal;
