/* ═══════════════════════════════════════════════════════════════════════
   CLARK · FreeSupplierReturnModal (V21.27.81)
   ───────────────────────────────────────────────────────────────────────
   مرتجع حر للمورد — مش مربوط باستلام واحد. طلب Ahmed:
   «زر إضافة مرتجع يفتح بوب اب نفس نظام/بنود مرتجع المبيعات، ولما أختار المورد
    يعرض بس الأصناف اللي تم استلامها من المورد ده — مش كل الأصناف».

   • تختار المورد → بيتجمّع كل الأصناف المستلَمة منه عبر كل استلاماته
     (data.purchaseReceipts) مع: إجمالي المستلم − المرتجع سابقًا = المتبقي.
   • تحدّد كمية المرتجع لكل صنف (≤ المتبقي).
   • عند التأكيد:
       - يطلع المخزون (applyStockDelta سالب + حركة purchase_return) لو المخزن مفعّل.
       - يعمل/يدمج إشعار مدين (upsertDebitNoteFromReturn) يقلّل مستحق المورد.
       - يوزّع الكمية المرتجعة على استلامات المورد (FIFO) ويسجّلها في
         receipt._returns — عشان returnedByLine يفضل متّسق بين المرتجع الحر
         والمرتجع من الاستلام.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Card, Inp, SearchSel } from "../ui.jsx";
import { T } from "../../theme.js";
import { FS } from "../../constants/index.js";
import { fmt, r2, gid } from "../../utils/format.js";
import { ask, tell, showToast } from "../../utils/popups.js";
import { applyStockDelta, getCategoryById } from "../../utils/categories.js";
import { upsertDebitNoteFromReturn } from "../../utils/invoices.js";

const TH = { padding: "6px 8px", textAlign: "right", fontSize: FS - 3, fontWeight: 700, color: T.textSec, borderBottom: "2px solid " + T.brd, whiteSpace: "nowrap" };
const TD = { padding: "5px 8px", fontSize: FS - 1, borderBottom: "1px solid " + T.brd };

export function FreeSupplierReturnModal({ data, upConfig, user, onClose, onCreated }){
  const userName = user?.displayName || (user?.email || "").split("@")[0] || "";
  const suppliers = data.suppliers || [];
  const purchaseReceipts = data.purchaseReceipts || [];
  const stockEnabled = !!(data.purchaseSettings && data.purchaseSettings.stockEnabled);
  const today2 = new Date().toISOString().split("T")[0];

  const [supplierId, setSupplierId] = useState("");
  const [retQty, setRetQty] = useState({});   /* key(itemType:itemId) → qty */
  const [reason, setReason] = useState("");

  /* أصناف المورد المستلَمة فقط — مجمّعة عبر كل استلاماته */
  const items = useMemo(() => {
    if(!supplierId) return [];
    const map = {};
    purchaseReceipts
      .filter(r => String(r.supplierId) === String(supplierId))
      .forEach(r => {
        (r.items || []).forEach(it => {
          if(!it || it.itemId == null) return;
          const key = String(it.itemType) + ":" + String(it.itemId);
          if(!map[key]) map[key] = { key, itemType: it.itemType, itemId: it.itemId, itemName: it.itemName || "", unit: it.unit || "", recd: 0, returned: 0, _cost: 0, _qtyForCost: 0 };
          const q = Number(it.qty) || 0, p = Number(it.price) || 0;
          map[key].recd += q;
          map[key]._cost += q * p;
          map[key]._qtyForCost += q;
        });
        (r._returns || []).forEach(x => {
          if(!x || x.itemId == null) return;
          const key = String(x.itemType) + ":" + String(x.itemId);
          if(map[key]) map[key].returned += Number(x.qty) || 0;
        });
      });
    return Object.values(map).map(m => ({
      ...m,
      avgPrice: m._qtyForCost > 0 ? r2(m._cost / m._qtyForCost) : 0,
      remaining: Math.max(0, r2(m.recd - m.returned)),
    })).sort((a, b) => String(a.itemName).localeCompare(String(b.itemName), "ar"));
  }, [supplierId, purchaseReceipts]);

  const rows = items.map(it => ({ ...it, q: Math.max(0, Math.min(Number(retQty[it.key]) || 0, it.remaining)) }));
  const totalVal = rows.reduce((s, x) => s + x.q * (Number(x.avgPrice) || 0), 0);
  const anyAvail = items.some(it => it.remaining > 0);

  const setQ = (key, v, max) => setRetQty(p => ({ ...p, [key]: Math.max(0, Math.min(Number(v) || 0, max)) }));
  const fillAll = () => { const n = {}; items.forEach(it => { if(it.remaining > 0) n[it.key] = it.remaining; }); setRetQty(n); };
  const clearAll = () => setRetQty({});

  const confirm = async () => {
    const picked = rows.filter(x => x.q > 0);
    if(picked.length === 0){ await tell("لا توجد كميات", "حدّد كمية مرتجع لبند واحد على الأقل", { type: "warning" }); return; }
    const supplier = suppliers.find(s => String(s.id) === String(supplierId));
    const ok = await ask(
      "تأكيد مرتجع المورد",
      "مرتجع " + picked.length + " بند للمورد «" + (supplier?.name || "—") + "» بقيمة " + fmt(r2(totalVal)) + " ج.م.\n\n" +
      (stockEnabled ? "• هتطلع البضاعة من المخزن (راجعة للمورد).\n" : "") +
      "• هيتعمل إشعار مدين يقلّل المستحق للمورد.\n\nمتابعة؟",
      { confirmText: "تأكيد المرتجع" }
    );
    if(!ok) return;

    let dnNo = "";
    upConfig(d => {
      if(!Array.isArray(d.stockMovements)) d.stockMovements = [];
      const supplier2 = (d.suppliers || []).find(s => String(s.id) === String(supplierId));

      /* (1) عكس المخزون */
      if(stockEnabled){
        picked.forEach(it => {
          let catId = it.itemType; if(catId === "fabric") catId = "core_fabric"; else if(catId === "accessory") catId = "core_accessory";
          applyStockDelta(d, catId, it.itemId, -it.q, null);
          const cat = getCategoryById(d, catId);
          if(cat?.legacy === "fabric"){ const f = (d.fabrics || []).find(x => String(x.id) === String(it.itemId)); if(f && f.stock < 0) f.stock = 0; }
          else if(cat?.legacy === "accessory"){ const a = (d.accessories || []).find(x => String(x.id) === String(it.itemId)); if(a && a.stock < 0) a.stock = 0; }
          else { const x = (d.inventoryItems || []).find(y => String(y.id) === String(it.itemId)); if(x && x.stock < 0) x.stock = 0; }
          d.stockMovements.push({ id: gid(), type: "out", itemType: it.itemType, itemId: it.itemId, itemName: it.itemName || "", qty: -it.q, unit: it.unit || "", price: Number(it.avgPrice) || 0, date: today2, sourceType: "purchase_return", sourceId: null, notes: "مرتجع حر للمورد — " + (supplier2?.name || ""), createdBy: userName, createdAt: new Date().toISOString() });
        });
      }

      /* (2) إشعار مدين */
      const res = upsertDebitNoteFromReturn(d, {
        supplierId, supplierName: supplier2?.name || "", date: today2,
        items: picked.map(it => ({ itemType: it.itemType, itemId: it.itemId, itemName: it.itemName, name: it.itemName, qty: it.q, unitPrice: Number(it.avgPrice) || 0 })),
        notes: (reason || "").trim() || "مرتجع حر للمورد",
      }, supplier2, userName);
      dnNo = res && res.debitNote ? res.debitNote.debitNoteNo : "";
      const dnId = res && res.debitNote ? res.debitNote.id : "";

      /* (3) توزيع الكمية المرتجعة على استلامات المورد (FIFO) → receipt._returns */
      picked.forEach(it => {
        let left = it.q;
        const recIds = (d.purchaseReceipts || [])
          .filter(r => String(r.supplierId) === String(supplierId) && (r.items || []).some(x => String(x.itemType) === String(it.itemType) && String(x.itemId) === String(it.itemId)))
          .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
          .map(r => r.id);
        for(const rid of recIds){
          if(left <= 0) break;
          const ri = (d.purchaseReceipts || []).findIndex(x => x.id === rid);
          if(ri < 0) continue;
          const rr = d.purchaseReceipts[ri];
          if(!Array.isArray(rr._returns)) rr._returns = [];
          const recd = (rr.items || []).filter(x => String(x.itemType) === String(it.itemType) && String(x.itemId) === String(it.itemId)).reduce((s, x) => s + (Number(x.qty) || 0), 0);
          const done = rr._returns.filter(x => String(x.itemType) === String(it.itemType) && String(x.itemId) === String(it.itemId)).reduce((s, x) => s + (Number(x.qty) || 0), 0);
          const take = Math.min(left, Math.max(0, recd - done));
          if(take > 0){
            rr._returns.push({ itemType: it.itemType, itemId: it.itemId, itemName: it.itemName, qty: take, price: Number(it.avgPrice) || 0, date: today2, debitNoteId: dnId, by: userName, at: new Date().toISOString(), _free: true });
            left -= take;
          }
        }
      });
    });

    showToast("✅ تم المرتجع — إشعار مدين " + dnNo + (stockEnabled ? " + خصم المخزن" : ""));
    onCreated && onCreated();
    onClose();
  };

  return (
    <div className="pop-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100002, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={e => { if(e.target === e.currentTarget) onClose(); }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.cardSolid, borderRadius: 16, padding: 20, width: "100%", maxWidth: 860, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: FS + 2, fontWeight: 800, color: "#3B82F6" }}>↪️ مرتجع مورد (حر)</div>
          <Btn ghost small onClick={onClose}>✕</Btn>
        </div>

        <div style={{ flex: 1, overflowY: "auto", paddingInlineEnd: 4 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 600, marginBottom: 4, display: "block" }}>المورد <span style={{ color: T.err }}>*</span></label>
            <SearchSel value={supplierId} onChange={v => { setSupplierId(v); setRetQty({}); }} options={suppliers.map(s => ({ value: s.id, label: s.name }))} placeholder="ابحث عن المورد..." />
            <div style={{ fontSize: FS - 3, color: T.textMut, marginTop: 4 }}>هتظهر بس الأصناف اللي تم استلامها من المورد ده.</div>
          </div>

          {!supplierId ? (
            <div style={{ padding: 30, textAlign: "center", color: T.textMut, background: T.bg, borderRadius: 10, border: "1px dashed " + T.brd }}>اختر المورد لعرض أصنافه المستلَمة</div>
          ) : items.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", color: T.textMut, background: T.bg, borderRadius: 10, border: "1px dashed " + T.brd }}>لا توجد أصناف مستلَمة من هذا المورد</div>
          ) : !anyAvail ? (
            <div style={{ padding: 30, textAlign: "center", color: T.warn, background: T.warn + "08", borderRadius: 10, border: "1px solid " + T.warn + "30" }}>كل أصناف هذا المورد تم إرجاعها بالكامل</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <Btn small onClick={fillAll} style={{ background: "#3B82F612", color: "#3B82F6", border: "1px solid #3B82F630" }}>مرتجع الكل (المتبقي)</Btn>
                <Btn small ghost onClick={clearAll}>تصفير</Btn>
              </div>
              <div style={{ overflowX: "auto", border: "1px solid " + T.brd, borderRadius: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={TH}>الصنف</th>
                    <th style={{ ...TH, textAlign: "center" }}>المستلم</th>
                    <th style={{ ...TH, textAlign: "center" }}>مرتجع سابق</th>
                    <th style={{ ...TH, textAlign: "center" }}>المتبقي</th>
                    <th style={{ ...TH, textAlign: "center", width: 110 }}>كمية المرتجع</th>
                    <th style={{ ...TH, textAlign: "center" }}>السعر</th>
                    <th style={{ ...TH, textAlign: "center" }}>القيمة</th>
                  </tr></thead>
                  <tbody>
                    {rows.map(it => (
                      <tr key={it.key} style={{ opacity: it.remaining > 0 ? 1 : 0.5 }}>
                        <td style={{ ...TD, fontWeight: 700 }}>{it.itemName || "—"}{it.unit ? <span style={{ color: T.textMut, fontWeight: 400, fontSize: FS - 3 }}>{" (" + it.unit + ")"}</span> : null}</td>
                        <td style={{ ...TD, textAlign: "center", color: T.textSec }}>{fmt(it.recd)}</td>
                        <td style={{ ...TD, textAlign: "center", color: T.textMut }}>{it.returned ? fmt(it.returned) : "—"}</td>
                        <td style={{ ...TD, textAlign: "center", fontWeight: 700, color: "#F59E0B" }}>{fmt(it.remaining)}</td>
                        <td style={{ ...TD, padding: "3px 6px" }}>
                          <Inp type="number" value={retQty[it.key] || ""} onChange={v => setQ(it.key, v, it.remaining)} disabled={it.remaining <= 0} style={{ textAlign: "center", padding: "5px 6px" }} />
                        </td>
                        <td style={{ ...TD, textAlign: "center", color: T.textSec }}>{fmt(r2(it.avgPrice))}</td>
                        <td style={{ ...TD, textAlign: "center", fontWeight: 700, color: "#3B82F6" }}>{it.q > 0 ? fmt(r2(it.q * it.avgPrice)) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

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
