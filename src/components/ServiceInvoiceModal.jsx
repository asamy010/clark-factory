/* ═══════════════════════════════════════════════════════════════════════
   CLARK · ServiceInvoiceModal (V21.17.4 — فاتورة يدوية بمحرّر Odoo)
   ───────────────────────────────────────────────────────────────────────
   فاتورة يدوية مباشرة (منتجات + خدمات/نص حر) لا تمر بدورة التسليم/الاستلام.
   بتستخدم DocLineEditor: بحث منتج موحّد + نص حر + وحدة + خصم % + أقسام.

   Mode: "sales" أو "purchase".
   بتتحفظ كـ subtype:"service" → محاسبة فقط (بدون مساس مخزون)، status="draft".
   الترحيل المحاسبي يحصل من قائمة الفواتير زي أي فاتورة (المُرحِّل لم يُمسّ).
   الخصم per-line بيتبني في السعر الصافي عشان نحافظ على schema الفاتورة.
   ═══════════════════════════════════════════════════════════════════════ */

import { useState, useMemo } from "react";
import { Btn, Inp, Sel } from "./ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";
import { fmt } from "../utils/format.js";
import { showToast } from "../utils/popups.js";
import { buildSalesServiceInvoice, buildPurchaseServiceInvoice } from "../utils/invoices.js";
import { DocLineEditor } from "./sales/DocLineEditor.jsx";

export function ServiceInvoiceModal({ mode, data, upConfig, user, onClose, isMob = false }){
  const isSales = mode === "sales";
  const today = new Date().toISOString().split("T")[0];
  const userName = user?.displayName || (user?.email || "").split("@")[0] || "";

  const parties = isSales ? (data.customers || []) : (data.suppliers || []);
  const titleColor = isSales ? T.accent : "#8B5CF6";

  const [date, setDate] = useState(today);
  const [partyId, setPartyId] = useState("");
  const [partyAdHoc, setPartyAdHoc] = useState("");
  const [discountPct, setDiscountPct] = useState(0);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([{ sourceType: "service", sourceId: "", modelNo: "", description: "", unit: "", qty: 1, unitPrice: 0, discountType: "pct", discountValue: 0 }]);

  /* مصادر المنتجات الموحّدة حسب النوع (مبيعات/مشتريات) + نص حر */
  const productOptions = useMemo(() => {
    if(isSales){
      return [
        ...(data.orders || []).map(o => ({ value: "order:" + o.id, label: "📋 " + (o.modelNo || "") + (o.modelDesc ? " — " + o.modelDesc : "") })),
        ...(data.inventoryItems || []).map(i => ({ value: "inventoryItem:" + i.id, label: "📦 " + (i.name || "") + (i.unit ? " (" + i.unit + ")" : "") })),
        ...(data.generalProducts || []).map(p => ({ value: "generalProduct:" + p.id, label: "🏷️ " + (p.name || p.modelNo || p.id) })),
      ];
    }
    return [
      ...(data.fabrics || []).map(f => ({ value: "fabric:" + f.id, label: "🧵 " + (f.name || "") + (f.unit ? " (" + f.unit + ")" : "") })),
      ...(data.accessories || []).map(a => ({ value: "accessory:" + a.id, label: "🧷 " + (a.name || "") + (a.unit ? " (" + a.unit + ")" : "") })),
      ...(data.generalProducts || []).map(p => ({ value: "generalProduct:" + p.id, label: "🏷️ " + (p.name || p.modelNo || p.id) })),
    ];
  }, [isSales, data.orders, data.inventoryItems, data.generalProducts, data.fabrics, data.accessories]);

  const resolveProduct = (value, cur) => {
    const s = String(value); const ci = s.indexOf(":");
    const sourceType = s.slice(0, ci), sourceId = s.slice(ci + 1);
    let modelNo = "", unit = cur?.unit || "", unitPrice = cur?.unitPrice;
    const findIn = (arr) => (arr || []).find(x => String(x.id) === String(sourceId));
    if(sourceType === "order"){ const o = findIn(data.orders); if(o){ modelNo = o.modelNo || ""; unitPrice = Number(o.sellPrice) || unitPrice; if(!unit) unit = "قطعة"; } }
    else if(sourceType === "inventoryItem"){ const it = findIn(data.inventoryItems); if(it){ modelNo = it.name || ""; unit = it.unit || unit; unitPrice = Number(it.price ?? it.sellPrice ?? 0) || unitPrice; } }
    else if(sourceType === "fabric"){ const f = findIn(data.fabrics); if(f){ modelNo = f.name || ""; unit = f.unit || unit; unitPrice = Number(f.avgCost ?? f.price ?? 0) || unitPrice; } }
    else if(sourceType === "accessory"){ const a = findIn(data.accessories); if(a){ modelNo = a.name || ""; unit = a.unit || unit; unitPrice = Number(a.avgCost ?? a.price ?? 0) || unitPrice; } }
    else if(sourceType === "generalProduct"){ const p = findIn(data.generalProducts); if(p){ modelNo = p.name || p.modelNo || ""; unit = p.unit || unit; unitPrice = Number(p.price ?? p.cost ?? p.sellPrice ?? 0) || unitPrice; } }
    return { sourceType, sourceId, modelNo, description: modelNo, unit, unitPrice };
  };

  /* صافي السطر (بعد خصم البند) */
  const lineNet = (it) => {
    const qty = Number(it.qty) || 0, up = Number(it.unitPrice) || 0, sub = qty * up, dv = Number(it.discountValue) || 0;
    const disc = it.discountType === "amount" ? Math.min(Math.max(dv, 0), sub) : sub * (Math.min(Math.max(dv, 0), 100) / 100);
    return sub - disc;
  };
  const subtotal = useMemo(() => items.reduce((s, it) => s + (it.isSection ? 0 : lineNet(it)), 0), [items]);
  const discount = subtotal * (Number(discountPct) || 0) / 100;
  const total = subtotal - discount;

  const realItems = items.filter(it => !it.isSection);
  const canSave = !!date && (!!partyId || !!partyAdHoc.trim()) &&
    realItems.length > 0 &&
    realItems.every(it => String(it.modelNo || it.description || "").trim() && Number(it.qty) > 0 && Number(it.unitPrice) >= 0);

  const save = async () => {
    if(!canSave){ showToast("⛔ أكمل البيانات: الطرف + بند واحد على الأقل بوصف وكمية وسعر"); return; }
    /* خريطة بنود الجريد → بنود الفاتورة (السعر الصافي بعد خصم البند). الأقسام تُمرّر. */
    const payloadItems = items.map(it => {
      if(it.isSection) return { isSection: true, title: it.title || "" };
      const qty = Number(it.qty) || 1;
      const net = lineNet(it);
      return { description: it.modelNo || it.description || "", qty, unitPrice: qty > 0 ? net / qty : (Number(it.unitPrice) || 0), unit: it.unit || "", accountId: "", accountName: "" };
    });
    const payload = {
      date,
      [isSales ? "customerId" : "supplierId"]: partyId || null,
      [isSales ? "customerNameAdHoc" : "supplierNameAdHoc"]: partyId ? "" : partyAdHoc.trim(),
      items: payloadItems,
      discountPct: Number(discountPct) || 0,
      notes,
    };
    upConfig(d => {
      const inv = isSales ? buildSalesServiceInvoice(d, payload, userName) : buildPurchaseServiceInvoice(d, payload, userName);
      const key = isSales ? "salesInvoices" : "purchaseInvoices";
      if(!Array.isArray(d[key])) d[key] = [];
      d[key].push(inv);
    });
    showToast("✓ تم حفظ الفاتورة اليدوية (مسودة)");
    onClose();
  };

  const partyLabel = isSales ? "العميل" : "المورد";

  return <div className="pop-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={(e) => { if(e.target === e.currentTarget) onClose(); }}>
    <div style={{ background: T.bg, borderRadius: 14, maxWidth: 980, width: "100%", maxHeight: "92vh", overflow: "auto", border: "2px solid " + titleColor + "30", boxShadow: "0 25px 70px rgba(0,0,0,0.4)" }}>
      <div style={{ position: "sticky", top: 0, background: T.bg, padding: "14px 18px", borderBottom: "1px solid " + T.brd, display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 3 }}>
        <div>
          <div style={{ fontSize: FS + 3, fontWeight: 900, color: titleColor }}>🧾 فاتورة يدوية {isSales ? "(مبيعات)" : "(مشتريات)"}</div>
          <div style={{ fontSize: FS - 2, color: T.textSec, marginTop: 2 }}>منتجات أو خدمات مباشرة — محاسبة فقط (لا تمر بالمخزن). تُحفظ كمسودة ثم تُرحّل.</div>
        </div>
        <Btn ghost onClick={onClose}>✕</Btn>
      </div>

      <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 2fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700 }}>التاريخ *</label>
            <Inp type="date" value={date} onChange={setDate} />
          </div>
          <div>
            <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700 }}>{partyLabel} *</label>
            <Sel value={partyId} onChange={(v) => { setPartyId(v); if(v) setPartyAdHoc(""); }}>
              <option value="">— اختر من القائمة أو اكتب اسم عابر —</option>
              {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Sel>
            {!partyId && <div style={{ marginTop: 6 }}><Inp value={partyAdHoc} onChange={setPartyAdHoc} placeholder={"أو اكتب اسم " + partyLabel + " يدوياً (لطرف عابر)"} /></div>}
          </div>
        </div>

        <div>
          <label style={{ fontSize: FS - 1, color: T.text, fontWeight: 800, display: "block", marginBottom: 6 }}>البنود</label>
          <DocLineEditor items={items} setItems={setItems} productOptions={productOptions} resolveProduct={resolveProduct} isMob={isMob} accent={titleColor} />
        </div>

        <div style={{ padding: 12, borderRadius: 10, background: titleColor + "08", border: "1px solid " + titleColor + "20" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "center" }}>
            <div>
              <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700 }}>خصم إجمالي %</label>
              <Inp type="number" value={discountPct} onChange={setDiscountPct} placeholder="0" />
            </div>
            <div style={{ textAlign: "end" }}>
              <div style={{ fontSize: FS - 2, color: T.textSec }}>إجمالي البنود: <b style={{ color: T.text }}>{fmt(subtotal)}</b></div>
              {discount > 0 && <div style={{ fontSize: FS - 2, color: T.textSec }}>خصم: <b style={{ color: T.err }}>−{fmt(discount)}</b></div>}
              <div style={{ fontSize: FS + 3, fontWeight: 900, color: titleColor, marginTop: 4 }}>{fmt(total)} ج</div>
            </div>
          </div>
        </div>

        <div>
          <label style={{ fontSize: FS - 2, color: T.textSec, fontWeight: 700 }}>ملاحظات</label>
          <Inp value={notes} onChange={setNotes} placeholder="ملاحظات اختيارية..." />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, paddingTop: 10, borderTop: "1px solid " + T.brd, flexWrap: "wrap" }}>
          <div style={{ fontSize: FS - 2, color: T.textSec }}>ⓘ تُحفظ كـ<b>مسودة</b>. الترحيل المحاسبي يحصل لما تضغط «ترحيل» من قائمة الفواتير.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn ghost onClick={onClose}>إلغاء</Btn>
            <Btn onClick={save} disabled={!canSave} style={{ background: canSave ? titleColor : T.brd, color: "#fff", fontWeight: 700, opacity: canSave ? 1 : 0.5 }}>💾 حفظ</Btn>
          </div>
        </div>
      </div>
    </div>
  </div>;
}
